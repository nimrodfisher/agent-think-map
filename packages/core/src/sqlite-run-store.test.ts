import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteRunStore } from "./sqlite-run-store.js";
import type { AppendDraft } from "./run-store.js";
const event = (id = "e"): AppendDraft => ({ schemaVersion:1,eventId:id,provider:"codex",sessionId:"s",timestamp:1,payload:{type:"run.started",runId:"s",prompt:"hi",ts:1} });
const dirs: string[] = [];
const path = () => { const dir=mkdtempSync(join(tmpdir(),"atm-sqlite-"));dirs.push(dir);return join(dir,"runs.db"); };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir,{recursive:true,force:true}); });
describe("SQLite lifecycle", () => {
  it("reports the physical page ceiling and keeps the connection usable after SQLITE_FULL", async () => {
    const store=new SqliteRunStore({path:":memory:",maxDbBytes:65536});
    try {
      let failure: unknown;
      for(let i=0;i<500;i++) {
        try { await store.append(event(String(i))); } catch(error) { failure=error;break; }
      }
      expect(failure).toBeInstanceOf(Error);expect((failure as Error).message).toMatch(/capacity exceeded/);
      const rows=await store.readRun("s");expect(rows.length).toBeGreaterThan(0);
      expect(rows.map(row=>row.sequence)).toEqual(rows.map((_,i)=>i+1));
      expect((await store.append(event("0"))).inserted).toBe(false);
    } finally {await store.close();}
  });
  it("migrates empty/version-0 fixture once, reopens version 1, preserves extensions and WAL/indexes/cascade", async () => {
    const file=path(); const fixture=new DatabaseSync(file);
    fixture.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)");fixture.close();
    let store=new SqliteRunStore({path:file});
    const input={...event(), extension:{future:1},payload:{...event().payload, future:{nested:true}}};
    await store.append(input);await store.close();store=new SqliteRunStore({path:file});
    expect((await store.readRun("s"))[0]).toMatchObject(input);
    expect(await store.markInterrupted(2)).toBe(1);expect(await store.getRun("s")).toMatchObject({status:"interrupted"});
    const db=new DatabaseSync(file);
    expect(db.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("wal");
    expect(db.prepare("SELECT * FROM schema_migrations").all()).toHaveLength(4);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all()).toHaveLength(7);
    await store.deleteRun("s");expect(db.prepare("SELECT * FROM events").all()).toHaveLength(0);
    db.close();await store.close();
  });
  it("rejects oversized events and capacity overflow atomically, with no sequence gaps", async () => {
    const store=new SqliteRunStore({path:":memory:",maxEventBytes:300,maxDbBytes:450});
    try {
      await expect(store.append({...event(),huge:"x".repeat(400)})).rejects.toThrow(/byte limit/);
      expect(await store.getRun("s")).toBeUndefined();
      await store.append(event());await store.append(event("b"));
      await expect(store.append(event("c"))).rejects.toThrow(/capacity/);
      expect((await store.readRun("s")).map(e=>e.sequence)).toEqual([1,2]);
    } finally {await store.close();}
  });
  it("rolls back an entire hook batch and refuses unknown migration versions", async () => {
    const file=path();const store=new SqliteRunStore({path:file,maxEventBytes:300});
    await expect(store.appendBatch([event(),{...event("b"),huge:"x".repeat(400)}])).rejects.toThrow();
    expect(await store.readRun("s")).toEqual([]);await store.close();
    const db=new DatabaseSync(file);db.exec("INSERT INTO schema_migrations VALUES(99,1)");db.close();
    expect(()=>new SqliteRunStore({path:file})).toThrow(/Unsupported/);
  });
  it("observes another connection and preserves per-run order", async () => {
    const file=path();const a=new SqliteRunStore({path:file});const b=new SqliteRunStore({path:file});
    try {
      const seen:number[]=[];const stop=a.subscribe("s",0,e=>seen.push(e.sequence));
      await Promise.all([a.append(event()),b.append(event("b")),a.append(event("c"))]);
      await new Promise(resolve=>setTimeout(resolve,160));expect(seen).toEqual([1,2,3]);stop();
    } finally {await a.close();await b.close();}
  });
});
