import { afterEach, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteRunStore } from "./sqlite-run-store.js";
import { ImportLiveRunError, type AppendDraft } from "./run-store.js";
const dirs: string[] = [], stores: SqliteRunStore[] = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), "atm-import-store-")); dirs.push(path); return join(path, "runs.db"); };
const open = (path: string) => { const store = new SqliteRunStore({ path }); stores.push(store); return store; };
const event = (id: string, imported = true): AppendDraft => ({ schemaVersion: 1, eventId: id, sessionId: id, provider: "claude-code", timestamp: 1, payload: { type: "run.started", runId: id, prompt: "Saved history", ts: 1 }, ...(imported ? { origin: "imported" as const } : {}) });
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it("previews v3 without migration, then migrates in place preserving rows and defaulting origin to live", async () => {
  const path = temp(), store = open(path);
  await store.append(event("saved", false)); await store.patchRun("saved", { bookmarked: true, outcome: "worked", label: "Keep me" }); await store.close();
  const fixture = new DatabaseSync(path);
  fixture.exec("ALTER TABLE runs DROP COLUMN origin; DELETE FROM schema_migrations WHERE version=4"); fixture.close();
  const bytes = readFileSync(path);
  const preview = SqliteRunStore.importPreview(path); stores.push(preview);
  expect(await preview.getRun("saved")).toMatchObject({ origin: "live", bookmarked: true, label: "Keep me" }); await preview.close();
  expect(readFileSync(path)).toEqual(bytes);
  const upgraded = open(path);
  expect(await upgraded.getRun("saved")).toMatchObject({ origin: "live", bookmarked: true, outcome: "worked", eventCount: 1 });
  const inspection = new DatabaseSync(path, { readOnly: true });
  expect(inspection.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map(row => row.version)).toEqual([1, 2, 3, 4]); inspection.close();
});

it("does not create a missing preview database or its parent directory", async () => {
  const path = join(temp(), "missing", "runs.db");
  const preview = SqliteRunStore.importPreview(path); stores.push(preview);
  await preview.append(event("simulation"));
  expect(existsSync(path)).toBe(false); expect(existsSync(join(path, ".."))).toBe(false);
});

it("filters provenance and scopes interruption, preserving old callers and concurrent live promotion", async () => {
  const path = temp(), store = open(path), other = open(path);
  await store.append(event("one")); await store.append(event("two")); await store.append(event("live", false));
  expect((await store.listRuns({ origin: "imported" })).items.map(run => run.runId)).toEqual(["one", "two"]);
  expect((await store.listRuns({ origin: "live" })).items.map(run => run.runId)).toEqual(["live"]);
  expect(await store.markInterrupted(2, "claude-code", [])).toBe(0);
  await other.append({ ...event("one", false), eventId: "live-one", payload: { type: "node.started", id: "tool", kind: "tool", title: "Read", ts: 1 } });
  expect(await store.markInterrupted(2, "claude-code", ["one", "two"], "imported")).toBe(1);
  expect(await store.getRun("one")).toMatchObject({ status: "running", origin: "live" });
  expect(await store.getRun("two")).toMatchObject({ status: "interrupted", origin: "imported" });
  await expect(store.appendBatch([event("third"), { ...event("one"), eventId: "later" }])).rejects.toBeInstanceOf(ImportLiveRunError);
  expect(await store.getRun("third")).toBeUndefined();
  expect(await store.markInterrupted(3, "claude-code")).toBe(2);
  await expect(store.listRuns({ origin: "unknown" as any })).rejects.toThrow("origin");
});

it("previews committed WAL events from an open Studio without modifying its files", async () => {
  const path = temp(), store = open(path);
  await store.append(event("wal-only"));
  const before = [path,path + '-wal',path + '-shm'].map(file => readFileSync(file));
  const preview = SqliteRunStore.importPreview(path); stores.push(preview);
  expect(await preview.getRun("wal-only")).toMatchObject({ origin: "imported", eventCount: 1 });
  await preview.append(event("simulation")); await preview.close();
  expect([path,path + '-wal',path + '-shm'].map(file => readFileSync(file))).toEqual(before);
  expect(await store.getRun("simulation")).toBeUndefined();
});
