import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as transcript from "./transcript.js";
import { ClaudeCodeHistoryImporter } from "./import-history.js";
import { importLocalHistory, type ImportSource } from "../../../core/src/history-import.js";
import { SqliteRunStore } from "../../../core/src/sqlite-run-store.js";
import { initialTraceState, reduceTrace } from "../../../core/src/index.js";
import type { AppendDraft } from "../../../core/src/run-store.js";

const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const dirs: string[] = [], stores: SqliteRunStore[] = [];
const root = () => { const path = mkdtempSync(join(tmpdir(), "atm-import-")); dirs.push(path); return path; };
const store = (path = ":memory:") => { const value = new SqliteRunStore({ path }); stores.push(value); return value; };
const importer = new ClaudeCodeHistoryImporter();
const message = (type: string, uuid: string | undefined, content: unknown, extra = {}) => ({ type, uuid, timestamp: "2026-09-01T10:00:00.000Z", sessionId: id, message: { content }, ...extra });
const fixture = () => [
  message("user", "u1", "Inspect the repository"),
  message("assistant", "a1", [{ type: "tool_use", id: "tool-read", name: "Read", input: { file_path: "README.md" } }], { parentUuid: "u1" }),
  message("user", "r1", [{ type: "tool_result", tool_use_id: "tool-read", content: "Read it" }], { parentUuid: "a1" }),
  message("assistant", "a2", [{ type: "tool_use", id: "task", name: "Task", input: { description: "Review" } }]),
  message("assistant", "child", [{ type: "tool_use", id: "child-read", name: "Read", input: { file_path: "src/index.ts" } }], { isSidechain: true, parentUuid: "a2" }),
  message("user", "child-result", [{ type: "tool_result", tool_use_id: "child-read", content: "Permission denied", is_error: true }], { isSidechain: true, parentUuid: "child" }),
  message("user", "r2", [{ type: "tool_result", tool_use_id: "task", content: "Review complete" }]),
  message("assistant", "answer", "Review complete", { message: { model: "claude-test", usage: { input_tokens: 10, output_tokens: 2 }, content: [{ type: "text", text: "Review complete" }] } }),
  message("user", undefined, "Summarize that"),
  message("assistant", "answer2", "Summary", { message: { model: "claude-test", usage: { input_tokens: 4 }, content: "Summary" } }),
  { type: "system", subtype: "session_end", uuid: "end", sessionId: id, timestamp: "2026-09-01T10:01:00.000Z" },
];
function write(path: string, records: unknown[], session = id) {
  const file = join(path, session + ".jsonl"); writeFileSync(file, records.map(record => JSON.stringify(record)).join("\n") + "\n"); return file;
}
const live = (sessionId = id): AppendDraft => ({ schemaVersion: 1, provider: "claude-code", sessionId, eventId: "live-" + sessionId, timestamp: 1, payload: { type: "run.started", runId: sessionId, prompt: "Live", ts: 1 } });
afterEach(async () => { vi.restoreAllMocks(); for (const value of stores.splice(0)) await value.close(); for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("Claude Code local history", () => {
  it("imports multi-turn tools, recorded Task children, failures and metadata once", async () => {
    const path = root(), db = store(); write(path, fixture());
    const result = await importLocalHistory(db, importer, { root: path });
    expect(result).toMatchObject({ filesSeen: 1, filesSkipped: 0, linesSkipped: 0, runsCreated: 1 });
    const events = await db.readRun(id);
    const run = await db.getRun(id);
    expect(run).toMatchObject({ origin: "imported", status: "completed", prompt: "Inspect the repository", model: "claude-test", usage: { inputTokens: 14, outputTokens: 2 } });
    const state = events.reduce((state, envelope) => reduceTrace(state, envelope.payload), initialTraceState);
    expect(state.nodes.filter(node => node.kind === "user")).toHaveLength(2);
    expect(state.nodes.find(node => node.id === "tool-read")).toMatchObject({ parentId: "user-" + id, operation: { name: "read" }, input: '{"file_path":"README.md"}' });
    expect(state.nodes.find(node => node.id === "task")?.kind).toBe("subagent");
    expect(state.nodes.find(node => node.id === "child-read")).toMatchObject({ parentId: "task", status: "failed" });
    expect(events.every(event => event.importedFrom === id + ".jsonl")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(path);
    expect(events.some(event => event.eventId.includes("line-9"))).toBe(true);
    const again = await importLocalHistory(db, importer, { root: path });
    expect(again).toMatchObject({ runsCreated: 0, runsMerged: 0, eventsAppended: 0, eventsAlreadyPresent: events.length });
    expect(await db.readRun(id)).toEqual(events);
  });

  it("counts malformed, invalid, unreadable and empty sources; never imports child files as runs", async () => {
    const path = root(), db = store();
    const file = write(path, [message("user", "u", "Hello"), { type: "assistant", message: {} }]);
    appendFileSync(file, "{broken\nnull\n");
    writeFileSync(join(path, secondId + ".jsonl"), "");
    mkdirSync(join(path, "subagents")); write(join(path, "subagents"), fixture());
    writeFileSync(join(path, "agent-abc.jsonl"), "{}");
    const result = await importLocalHistory(db, importer, { root: path });
    expect(result).toMatchObject({ filesSeen: 3, filesSkipped: 2, linesSkipped: 3, runsCreated: 1 });
    expect((await db.getRun(id))?.status).toBe("interrupted");
    vi.spyOn(transcript, "readTranscriptFile").mockReturnValue(undefined);
    const unreadable = await importLocalHistory(db, importer, { root: path });
    expect(unreadable.filesSkipped).toBe(3);
    expect(unreadable.diagnostics.some(item => item.code === "unreadable-file")).toBe(true);
    expect((await importLocalHistory(db, importer, { root: join(path, "missing") })).directoriesSkipped).toBe(1);
  });

  it("does not mistake end_turn or a tool response for a session end; updates a growing import", async () => {
    const path = root(), db = store();
    const file = write(path, fixture().slice(0, 8));
    await db.append(live("unrelated"));
    await importLocalHistory(db, importer, { root: path });
    expect((await db.getRun(id))?.status).toBe("interrupted");
    expect((await db.getRun("unrelated"))?.status).toBe("running");
    const prior = await db.readRun(id);
    appendFileSync(file, fixture().slice(8).map(record => JSON.stringify(record)).join("\n") + "\n");
    const result = await importLocalHistory(db, importer, { root: path });
    expect(result).toMatchObject({ runsCreated: 0, runsMerged: 1 });
    expect(result.eventsAppended).toBeGreaterThan(0);
    expect((await db.readRun(id)).slice(0, prior.length)).toEqual(prior);
    expect(await db.getRun(id)).toMatchObject({ status: "completed", usage: { inputTokens: 14 } });
    expect((await importLocalHistory(db, importer, { root: path })).eventsAppended).toBe(0);
  });

  it("tolerates opaque malformed-Unicode UUIDs and does not complete on end_turn", async () => {
    const path = root(), db = store();
    write(path, [message('user','\ud800','Hello'), message('assistant','a','Done',{message:{content:'Done',stop_reason:'end_turn'}})]);
    expect((await importLocalHistory(db, importer, { root: path })).runsCreated).toBe(1);
    expect((await db.getRun(id))?.status).toBe('interrupted');
    expect((await db.readRun(id)).some(event=>event.payload.type==='run.completed')).toBe(false);
    expect((await importLocalHistory(db, importer, { root: path })).eventsAppended).toBe(0);
  });

  it("skips existing live sessions before conversion and handles a concurrent live append", async () => {
    const path = root(), db = store(); write(path, fixture()); await db.append(live());
    const convert = vi.spyOn(importer, "convert");
    expect(await importLocalHistory(db, importer, { root: path })).toMatchObject({ liveRunsSkipped: 1, eventsAppended: 0 });
    expect(convert).not.toHaveBeenCalled();
    await db.deleteRun(id);
    const racing = new ClaudeCodeHistoryImporter();
    const original = racing.convert.bind(racing);
    vi.spyOn(racing, "convert").mockImplementation(async function* (source: ImportSource) { yield* original(source); await db.append(live()); });
    expect(await importLocalHistory(db, racing, { root: path })).toMatchObject({ liveRunsSkipped: 1, eventsAppended: 0 });
    expect(await db.readRun(id)).toHaveLength(1);
    expect(await db.getRun(id)).toMatchObject({ origin: "live", status: "running" });
  });

  it("promotes imported runs on live continuation and prevents further imports", async () => {
    const path = root(), db = store(); write(path, fixture().slice(0, 8));
    await importLocalHistory(db, importer, { root: path }); await db.append(live());
    expect((await db.getRun(id))?.origin).toBe("live");
    const before = await db.readRun(id);
    expect((await importLocalHistory(db, importer, { root: path })).liveRunsSkipped).toBe(1);
    expect(await db.readRun(id)).toEqual(before);
  });

  it("redacts all persisted text and surfaces storage failures instead of reporting skips", async () => {
    const path = root(), db = store(); const secret = "sk-abcdefghijklmnopqrstuvwx";
    write(path, [message("user", "u", secret), message("assistant", "a", [{ type: "tool_use", id: "t", name: "Read", input: { token: secret } }]), message("user", "r", [{ type: "tool_result", tool_use_id: "t", content: secret, is_error: true }])]);
    await importLocalHistory(db, importer, { root: path });
    expect(JSON.stringify(await db.readRun(id))).not.toContain(secret);
    expect((await db.listRuns({ q: secret })).items).toEqual([]);
    await db.deleteRun(id);
    vi.spyOn(db, "appendBatch").mockRejectedValue(new Error("Run store capacity exceeded"));
    await expect(importLocalHistory(db, importer, { root: path })).rejects.toThrow("capacity exceeded");
  });

  it("simulates duplicates and new sources without changing the source database", async () => {
    const path = root(), file = join(path, "runs.db"), db = store(file); write(path, fixture());
    await importLocalHistory(db, importer, { root: path }); await db.close();
    const bytes = readFileSync(file);
    const preview = SqliteRunStore.importPreview(file); stores.push(preview);
    expect((await importLocalHistory(preview, importer, { root: path })).eventsAppended).toBe(0);
    write(path, [message("user", "new", "Another session", { sessionId: secondId })], secondId);
    expect((await importLocalHistory(preview, importer, { root: path })).runsCreated).toBe(1);
    await preview.close();
    expect(readFileSync(file)).toEqual(bytes);
    const actual = store(file); expect(await actual.getRun(secondId)).toBeUndefined();
  });
});
