import { createHash, randomUUID } from "node:crypto";
import { parseTraceEnvelope, type AgentTraceEvent, type Provider, type TraceUsage } from "../../protocol/src/index.js";
import type { Listener, RunFilter, RunPatch, RunStore } from "./run-store.js";
import { SqliteRunStore, type SqliteRunStoreOptions } from "./sqlite-run-store.js";

export interface TraceHubOptions extends SqliteRunStoreOptions { store?: RunStore; now?: () => number; recover?: boolean }
export interface SessionSummary {
  id: string; prompt: string; live: boolean; status: string; updatedAt: number;
  eventCount: number; model?: string; effort?: string; usage?: TraceUsage;
}
export class TraceHub {
  readonly store: RunStore;
  ready: Promise<void> = Promise.resolve();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly provider: Provider, protected readonly options: TraceHubOptions = {}) {
    this.store = options.store ?? new SqliteRunStore(options);
    if (options.recover !== false) this.recover();
  }
  /** CLI calls after binding its port, so a failed second launch cannot interrupt the active Studio. */
  recover(): Promise<void> {
    this.ready = this.store.markInterrupted((this.options.now?.() ?? Date.now()) + 1, this.provider).then(() => {});
    return this.ready;
  }
  protected serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => this.ready).then(work);
    this.tail = result.catch(() => {}); return result;
  }
  append(input: unknown, sessionId: string) {
    return this.serial(() => this.store.append(parseTraceEnvelope(input,{ provider: this.provider, sessionId })));
  }
  async listRuns(filter: RunFilter = {}) { await this.tail; await this.ready; return this.store.listRuns(filter); }
  patchRun(id: string, patch: RunPatch) { return this.serial(() => this.store.patchRun(id,patch)); }
  rebuildSearchIndex() { return this.serial(() => this.store.rebuildSearchIndex()); }
  compareRuns(bad: string, good: string) { return this.serial(() => { if (!this.store.compareRuns) throw new Error("Store does not support comparisons"); return this.store.compareRuns(bad,good); }); }
  getDiff(id: string) { return this.serial(() => { if (!this.store.getDiff) throw new Error("Store does not support comparisons"); return this.store.getDiff(id); }); }
  async list(): Promise<SessionSummary[]> {
    await this.tail; await this.ready;
    const { items } = await this.store.listRuns({ provider: this.provider, limit: 1000 });
    return items.sort((a,b) => a.updatedAt-b.updatedAt || a.runId.localeCompare(b.runId)).map(run => ({ id: run.runId, prompt: run.prompt, live: run.status === "running", status: run.status,
      updatedAt: run.updatedAt, eventCount: run.eventCount, model: run.model, effort: run.effort, usage: run.usage }));
  }
  drop(id: string) { return this.serial(() => this.store.deleteRun(id)); }
  subscribe(id: string, listener: (event: AgentTraceEvent) => void) { return this.subscribeEnvelopes(id,0,envelope => listener(envelope.payload)); }
  subscribeEnvelopes(id: string, after: number, listener: Listener) { return this.store.subscribe(id,after,listener); }
  updateUsage(id: string, usage: TraceUsage) { return this.updateMetadata(id,{ usage }); }
  updateMetadata(id: string, metadata: { model?: string; effort?: string; usage?: TraceUsage }) {
    return this.serial(async () => {
      const run = await this.store.getRun(id); if (!run) return false;
      if (Object.entries(metadata).every(([key,value]) => JSON.stringify(run[key as keyof typeof run]) === JSON.stringify(value))) return false;
      await this.store.append(parseTraceEnvelope({ type: "run.meta", runId: id, ...metadata, ts: this.options.now?.() ?? Date.now() },{ provider: this.provider, sessionId: id }));
      return true;
    });
  }
  async close() { await this.tail; await this.ready; await this.store.close(); }
}

export interface HookAdapter { ingest(hook: unknown): AgentTraceEvent[]; restore(events: AgentTraceEvent[]): void }
/** Shared hook orchestration; provider wrappers own only their live adapter map. */
export async function ingestHook(hub: TraceHub, hook: unknown, adapters: Map<string, HookAdapter>, create: () => HookAdapter): Promise<AgentTraceEvent[]> {
  if (!hook || typeof hook !== "object") return [];
  const msg = hook as Record<string, unknown>;
  const id = typeof msg.session_id === "string" && msg.session_id || "session";
  const history = await hub.store.readRun(id);
  // History can be deleted from the other provider's Studio/connection.
  if (!history.length) adapters.delete(id);
  const source = msg.event_id ?? msg.hook_id ?? (typeof msg.tool_use_id === "string" ? `${msg.hook_event_name}:${msg.tool_use_id}` : undefined);
  const delivery = typeof source === "string" && source ? createHash("sha256").update(JSON.stringify([hub.provider,id,source])).digest("hex") : randomUUID();
  if (history.some(event => event.hookDelivery === delivery && event.hookDeliveryComplete)) return [];
  let adapter = adapters.get(id);
  if (!adapter) { adapter = create(); adapter.restore(history.map(event => event.payload)); adapters.set(id,adapter); }
  const events = adapter.ingest(hook);
  const drafts = events.map((event,index) => {
    const envelope = parseTraceEnvelope(event,{ provider: hub.provider, sessionId: id, eventId: `${delivery}:${index}` });
    return { ...envelope, hookDelivery: delivery, hookDeliveryComplete: index === events.length-1,
      eventIdProvenance: source ? "stable-provider-hook-id" : "generated-delivery-id" };
  });
  let results;
  try { results = hub.store.appendBatch ? await hub.store.appendBatch(drafts) : await Promise.all(drafts.map(draft => hub.store.append(draft))); }
  catch (error) { adapters.delete(id); throw error; }
  if (events.some(event => event.type === "run.completed")) adapters.delete(id);
  return results.filter(result => result.inserted).map(result => result.envelope.payload);
}
