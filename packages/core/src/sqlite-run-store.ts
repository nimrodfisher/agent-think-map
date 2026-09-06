import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parseTraceEnvelope, type Provider, type TraceEnvelopeV1 } from "../../protocol/src/index.js";
import type { AppendDraft, AppendResult, Listener, Page, RetentionPolicy, RunFilter, RunRecord, RunStore, RunSummary, Unsubscribe } from "./run-store.js";

export const DEFAULT_MAX_EVENT_BYTES = 1024 * 1024;
export const DEFAULT_MAX_DB_BYTES = 512 * 1024 * 1024;
export interface SqliteRunStoreOptions { path?: string; maxEventBytes?: number; maxDbBytes?: number }
export const defaultRunStorePath = () => join(homedir(), ".agent-think-map", "runs.db");
// Version 1 is the first durable schema; version 0 is an empty database.
export const SCHEMA_V1 = `
CREATE TABLE runs (
 run_id TEXT PRIMARY KEY, provider TEXT NOT NULL, session_id TEXT NOT NULL,
 schema_version INTEGER NOT NULL, prompt TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
 started_at INTEGER, ended_at INTEGER, updated_at INTEGER NOT NULL, model TEXT, effort TEXT,
 usage_json TEXT, outcome TEXT, bookmarked INTEGER NOT NULL DEFAULT 0, label TEXT
);
CREATE TABLE events (
 run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE, sequence INTEGER NOT NULL,
 event_id TEXT NOT NULL UNIQUE, timestamp INTEGER NOT NULL, event_type TEXT NOT NULL,
 payload_json TEXT NOT NULL, byte_size INTEGER NOT NULL, PRIMARY KEY(run_id, sequence)
);
CREATE INDEX runs_provider_status_updated ON runs(provider, status, updated_at DESC);
CREATE INDEX runs_bookmarked_updated ON runs(bookmarked, updated_at DESC);
CREATE INDEX events_run_timestamp ON events(run_id, timestamp);
CREATE INDEX events_type ON events(event_type);`;

type Row = Record<string, any>;
const summarySelect = `SELECT runs.*, (SELECT count(*) FROM events WHERE run_id=runs.run_id) AS event_count,
 (SELECT coalesce(sum(byte_size),0) FROM events WHERE run_id=runs.run_id) AS byte_size FROM runs`;
function record(row: Row): RunRecord {
  return { runId: row.run_id, provider: row.provider, sessionId: row.session_id, schemaVersion: row.schema_version,
    prompt: row.prompt, status: row.status, startedAt: row.started_at ?? undefined, endedAt: row.ended_at ?? undefined,
    updatedAt: row.updated_at, model: row.model ?? undefined, effort: row.effort ?? undefined,
    usage: row.usage_json ? JSON.parse(row.usage_json) : undefined, outcome: row.outcome,
    bookmarked: Boolean(row.bookmarked), label: row.label ?? undefined, eventCount: row.event_count, byteSize: row.byte_size };
}

export class SqliteRunStore implements RunStore {
  private readonly db: DatabaseSync;
  private closed = false;
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly maxEventBytes: number;
  private readonly maxDbBytes: number;
  constructor(options: SqliteRunStoreOptions = {}) {
    const path = options.path ?? defaultRunStorePath();
    this.maxEventBytes = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
    this.maxDbBytes = options.maxDbBytes ?? DEFAULT_MAX_DB_BYTES;
    for (const limit of [this.maxEventBytes, this.maxDbBytes]) if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Storage limits must be positive integers");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_size_limit=4194304;");
      this.db.exec(`PRAGMA max_page_count=${Math.max(16, Math.floor(this.maxDbBytes / 4096))}`);
      this.transaction(() => {
        this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
        const versions = this.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
        if (versions.some(row => row.version !== 1)) throw new Error("Unsupported runs.db schema; upgrade agent-think-map before opening it");
        if (!versions.length) {
          this.db.exec(SCHEMA_V1);
          this.db.prepare("INSERT INTO schema_migrations VALUES(1, ?)").run(Date.now());
        }
      });
    } catch (error) { this.db.close(); throw error; }
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) {
      // SQLITE_FULL can already have rolled back the transaction.
      try { this.db.exec("ROLLBACK"); } catch { /* preserve the original failure */ }
      if (error instanceof Error && /database or disk is full/i.test(error.message)) {
        throw new Error("Run store capacity exceeded; prune unprotected runs, free disk space, or increase maxDbBytes", { cause: error });
      }
      throw error;
    }
  }
  private insert(draft: AppendDraft): AppendResult {
    const parsed = parseTraceEnvelope({ ...draft, sequence: 0 }, { provider: draft.provider, sessionId: draft.sessionId });
    const insert = (): AppendResult => {
      const prior = this.db.prepare("SELECT run_id, payload_json FROM events WHERE event_id=?").get(parsed.eventId);
      if (prior) {
        const envelope = JSON.parse(String(prior.payload_json)) as TraceEnvelopeV1;
        if (prior.run_id !== parsed.sessionId || envelope.provider !== parsed.provider) throw new Error("eventId already belongs to another run/provider");
        return { envelope, inserted: false };
      }
      const existing = this.db.prepare("SELECT provider FROM runs WHERE run_id=?").get(parsed.sessionId);
      if (existing && existing.provider !== parsed.provider) throw new Error("Session ID belongs to another provider");
      if ("runId" in parsed.payload && parsed.payload.runId !== parsed.sessionId) throw new Error("Payload runId must equal sessionId");
      const sequence = Number(this.db.prepare("SELECT coalesce(max(sequence),0)+1 AS seq FROM events WHERE run_id=?").get(parsed.sessionId)!.seq);
      const envelope = { ...parsed, sequence };
      const json = JSON.stringify(envelope);
      const bytes = Buffer.byteLength(json);
      if (bytes > this.maxEventBytes) throw new Error(`Event exceeds ${this.maxEventBytes} byte limit; shorten the payload`);
      const total = Number(this.db.prepare("SELECT coalesce(sum(byte_size),0) AS size FROM events").get()!.size);
      if (total + bytes > this.maxDbBytes) throw new Error("Run store capacity exceeded; prune unprotected runs or increase maxDbBytes");
      this.db.prepare("INSERT OR IGNORE INTO runs(run_id,provider,session_id,schema_version,status,updated_at) VALUES(?,?,?,?,?,?)")
        .run(envelope.sessionId, envelope.provider, envelope.sessionId, 1, "running", envelope.timestamp);
      this.db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?)")
        .run(envelope.sessionId, sequence, envelope.eventId, envelope.timestamp, envelope.payload.type, json, bytes);
      const event = envelope.payload;
      this.db.prepare("UPDATE runs SET updated_at=max(updated_at,?) WHERE run_id=?").run(envelope.timestamp, envelope.sessionId);
      if (event.type !== "run.meta" && event.type !== "run.completed") this.db.prepare("UPDATE runs SET status='running',ended_at=NULL WHERE run_id=?").run(envelope.sessionId);
      if (event.type === "run.started") this.db.prepare("UPDATE runs SET prompt=?, status='running', started_at=coalesce(started_at,?), ended_at=NULL WHERE run_id=?").run(event.prompt, event.ts, envelope.sessionId);
      if (event.type === "run.completed") this.db.prepare("UPDATE runs SET status='completed',ended_at=? WHERE run_id=?").run(event.ts, envelope.sessionId);
      if (event.type === "run.meta") this.db.prepare("UPDATE runs SET model=coalesce(?,model),effort=coalesce(?,effort) WHERE run_id=?").run(event.model ?? null,event.effort ?? null,envelope.sessionId);
      if ((event.type === "run.meta" || event.type === "run.completed") && event.usage) this.db.prepare("UPDATE runs SET usage_json=? WHERE run_id=?").run(JSON.stringify(event.usage),envelope.sessionId);
      return { envelope, inserted: true };
    };
    return insert();
  }
  async append(draft: AppendDraft): Promise<AppendResult> { return (await this.appendBatch([draft]))[0]; }
  async appendBatch(drafts: AppendDraft[]): Promise<AppendResult[]> {
    const results = this.transaction(() => drafts.map(draft => this.insert(draft)));
    for (const result of results) if (result.inserted) for (const pump of this.listeners.get(result.envelope.sessionId) ?? []) pump();
    return results;
  }
  async getRun(id: string): Promise<RunRecord | undefined> {
    const row = this.db.prepare(`${summarySelect} WHERE run_id=?`).get(id);
    return row ? record(row) : undefined;
  }
  async listRuns(filter: RunFilter = {}): Promise<Page<RunSummary>> {
    const limit = filter.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("limit must be 1..1000");
    const where: string[] = []; const args: (string | number)[] = [];
    for (const key of ["provider", "status", "bookmarked"] as const) if (filter[key] !== undefined) { where.push(`${key}=?`); args.push(key === "bookmarked" ? Number(filter[key]) : filter[key] as string); }
    if (filter.cursor) {
      const cursor = JSON.parse(filter.cursor);
      if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || typeof cursor[1] !== "string") throw new Error("Invalid run cursor");
      where.push("(updated_at < ? OR (updated_at = ? AND run_id > ?))"); args.push(cursor[0],cursor[0],cursor[1]);
    }
    const rows = this.db.prepare(`${summarySelect}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC,run_id ASC LIMIT ?`).all(...args,limit+1);
    const items = rows.slice(0,limit).map(record); const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? JSON.stringify([last.updatedAt,last.runId]) : undefined };
  }
  private read(id: string, after: number): TraceEnvelopeV1[] {
    return this.db.prepare("SELECT payload_json FROM events WHERE run_id=? AND sequence>? ORDER BY sequence").all(id,after).map(row => JSON.parse(String(row.payload_json)));
  }
  async readRun(id: string, after = 0) { return this.read(id,after); }
  async setOutcome(id: string, outcome: "worked" | "failed" | null) { this.db.prepare("UPDATE runs SET outcome=? WHERE run_id=?").run(outcome,id); }
  async setBookmark(id: string, bookmark: boolean, label?: string) { this.db.prepare("UPDATE runs SET bookmarked=?,label=? WHERE run_id=?").run(Number(bookmark),label ?? null,id); }
  async markInterrupted(before: number, provider?: Provider) {
    return Number(this.db.prepare("UPDATE runs SET status='interrupted',ended_at=? WHERE status='running' AND updated_at<?" + (provider ? " AND provider=?" : ""))
      .run(before,before,...(provider ? [provider] : [])).changes);
  }
  async deleteRun(id: string) { return Number(this.db.prepare("DELETE FROM runs WHERE run_id=?").run(id).changes) > 0; }
  async prune(policy: RetentionPolicy): Promise<number> {
    for (const value of [policy.before,policy.maxRuns,policy.maxBytes]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error("Retention limits must be nonnegative");
    return this.transaction(() => {
      const rows = this.db.prepare(`${summarySelect} ORDER BY updated_at ASC,run_id ASC`).all().map(record);
      let count = rows.length; let bytes = rows.reduce((sum,row) => sum+row.byteSize,0); let deleted = 0;
      for (const row of rows) {
        if (row.bookmarked && !policy.includeBookmarked || row.status === "running" && !policy.includeRunning) continue;
        if (!(policy.before !== undefined && row.updatedAt < policy.before || count > (policy.maxRuns ?? Infinity) || bytes > (policy.maxBytes ?? Infinity))) continue;
        this.db.prepare("DELETE FROM runs WHERE run_id=?").run(row.runId); count--; bytes -= row.byteSize; deleted++;
      }
      return deleted;
    });
  }
  subscribe(id: string, after: number, listener: Listener): Unsubscribe {
    if (this.closed) throw new Error("Run store is closed");
    let cursor = after; let stopped = false; let pumping = false;
    // Register first, then read. Reentrant appends are drained on the next loop;
    // polling also observes commits from another SQLite connection/process.
    const pump = () => {
      if (stopped || pumping) return;
      pumping = true;
      try {
        while (!stopped) {
          const batch = this.read(id,cursor); if (!batch.length) break;
          for (const envelope of batch) { if (stopped) break; cursor = envelope.sequence; listener(envelope); }
        }
      } catch { stop(); } finally { pumping = false; }
    };
    const set = this.listeners.get(id) ?? new Set(); this.listeners.set(id,set); set.add(pump);
    const timer = setInterval(pump,100); timer.unref();
    const stop = () => { stopped = true; clearInterval(timer); set.delete(pump); if (!set.size) this.listeners.delete(id); };
    pump(); return stop;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    // Pumps stop themselves when the closed connection is observed; clear now.
    this.db.close();
    for (const set of this.listeners.values()) for (const pump of set) pump();
    this.listeners.clear();
  }
}
