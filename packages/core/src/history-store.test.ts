import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_V1, SqliteRunStore } from "./sqlite-run-store.js";
import type { AppendDraft, RunFilter } from "./run-store.js";
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0)) rmSync(dir,{recursive:true,force:true});});
const file=()=>{const dir=mkdtempSync(join(tmpdir(),"atm-history-"));dirs.push(dir);return join(dir,"runs.db");};
import { seedHistory } from "../test/history-fixture.js";

describe("history storage",()=>{
  it("rolls back search updates with a failed event batch",async()=>{
    const store=new SqliteRunStore({path:":memory:",maxEventBytes:1024});
    try {
      await seedHistory(store,1);
      const base={schemaVersion:1 as const,eventId:"rename",provider:"claude-code" as const,sessionId:"run-00",timestamp:1001};
      await expect(store.appendBatch([
        {...base,payload:{type:"run.started",runId:"run-00",prompt:"replacementword",ts:1001}},
        {...base,eventId:"oversized",payload:{type:"node.delta",id:"t",text:"x".repeat(2048),ts:1001}},
      ])).rejects.toThrow(/byte limit/);
      expect((await store.listRuns({q:"replacementword"})).items).toEqual([]);
      expect((await store.listRuns({q:"orchard"})).items).toHaveLength(1);
    }finally{await store.close();}
  });
  it("migrates a populated Brief 1 fixture and rebuilds idempotently across restart",async()=>{
    const path=file();const db=new DatabaseSync(path);db.exec(SCHEMA_V1);
    db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL); INSERT INTO schema_migrations VALUES(1,1)");
    db.exec("INSERT INTO runs(run_id,provider,session_id,schema_version,prompt,status,updated_at,model) VALUES('old','codex','old',1,'Legacy orchard','completed',1,'legacy-model')");
    const envelope={schemaVersion:1,eventId:"old-event",provider:"codex",sessionId:"old",sequence:1,timestamp:1,payload:{type:"node.completed",id:"t",outputPreview:"legacy pineapple",ts:1}};
    const json=JSON.stringify(envelope);db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?)").run("old",1,"old-event",1,"node.completed",json,Buffer.byteLength(json));db.close();
    let store=new SqliteRunStore({path});
    try {
      expect((await store.listRuns({q:"pineapple"})).items.map(x=>x.runId)).toEqual(["old"]);
      await seedHistory(store);await store.rebuildSearchIndex();await store.rebuildSearchIndex();
      expect((await store.listRuns({q:"orchard"})).items).toHaveLength(25);
      await store.close();store=new SqliteRunStore({path});
      expect((await store.listRuns({q:"legacy model"})).items[0].runId).toBe("old");
    }finally{await store.close();}
  });
  it("combines filters and pages tied timestamps without gaps; annotations preserve the cursor key",async()=>{
    const store=new SqliteRunStore({path:":memory:"});
    try {
      await seedHistory(store);
      const filter:RunFilter={q:"read_file pineapple",provider:"codex",model:"model-shared",status:"completed",outcome:"worked",from:1000,to:1000,pageSize:2};
      const first=await store.listRuns(filter);expect(first.items.map(x=>x.runId)).toEqual(["run-01","run-07"]);
      await store.patchRun("run-01",{label:"baseline",bookmarked:true});
      const second=await store.listRuns({...filter,cursor:first.nextCursor});
      expect(second.items.map(x=>x.runId)).toEqual(["run-13","run-19"]);expect(second.nextCursor).toBeUndefined();
      expect((await store.listRuns({...filter,bookmarked:true})).items.map(x=>x.runId)).toEqual(["run-01"]);
      expect((await store.listRuns({q:"rawsecret"})).items).toEqual([]);
      expect((await store.listRuns({outcome:null})).items).toHaveLength(8);
    }finally{await store.close();}
  });
  it("persists independent patches, clears labels and cascades search/events on delete",async()=>{
    const path=file();let store=new SqliteRunStore({path});
    try {
      await seedHistory(store,2);await store.patchRun("run-00",{label:"baselinegood",outcome:"worked",bookmarked:true});
      await store.setBookmark("run-00",false);await store.close();store=new SqliteRunStore({path});
      expect(await store.getRun("run-00")).toMatchObject({label:"baselinegood",outcome:"worked",bookmarked:false});
      expect((await store.listRuns({q:"baselinegood"})).items).toHaveLength(1);
      await store.patchRun("run-00",{label:null,outcome:null});
      expect((await store.listRuns({q:"baselinegood"})).items).toHaveLength(0);
      await store.deleteRun("run-00");expect(await store.readRun("run-00")).toEqual([]);
      const db=new DatabaseSync(path);expect(db.prepare("SELECT * FROM run_search WHERE run_id='run-00'").all()).toEqual([]);db.close();
    }finally{await store.close();}
  });
});
