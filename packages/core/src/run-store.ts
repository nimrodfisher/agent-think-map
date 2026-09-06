import type { Provider, TraceEnvelopeV1, TraceUsage } from "../../protocol/src/index.js";

export type RunStatus = "running" | "completed" | "failed" | "interrupted";
export type RunOrigin = "live" | "imported";
/** Imported appends must never merge into a run with live evidence. */
export class ImportLiveRunError extends Error {
  constructor(readonly runId: string) { super("Import skipped: run already has live evidence"); this.name = "ImportLiveRunError"; }
}
export type AppendDraft = Pick<TraceEnvelopeV1, "schemaVersion" | "eventId" | "provider" | "sessionId" | "timestamp" | "payload"> & { sequence?: number; origin?: "imported"; [key: string]: unknown };
export type AppendResult = { envelope: TraceEnvelopeV1; inserted: boolean };
export interface RunSummary {
  runId: string; provider: Provider; sessionId: string; schemaVersion: number;
  prompt: string; status: RunStatus; startedAt?: number; endedAt?: number;
  updatedAt: number; model?: string; effort?: string; usage?: TraceUsage;
  outcome: "worked" | "failed" | null; bookmarked: boolean; label?: string;
  eventCount: number; origin: RunOrigin;
}
export interface RunRecord extends RunSummary { byteSize: number }
export interface RunFilter {
  q?: string; provider?: Provider; model?: string; status?: RunStatus;
  origin?: RunOrigin;
  outcome?: "worked" | "failed" | null; bookmarked?: boolean;
  from?: number; to?: number; pageSize?: number;
  limit?: number; cursor?: string;
}
export interface RunPatch { outcome?: "worked" | "failed" | null; bookmarked?: boolean; label?: string | null }
export interface Page<T> { items: T[]; nextCursor?: string }
export interface RetentionPolicy {
  before?: number; maxRuns?: number; maxBytes?: number;
  includeBookmarked?: boolean; includeRunning?: boolean;
}
export type Listener = (envelope: TraceEnvelopeV1) => void;
export type Unsubscribe = () => void;
export interface RunStore {
  listProblems?(): Promise<import("./problems.js").ProblemPage>;
  /** Optional derived comparison support; durable Studio defaults implement it. */
  compareRuns?(badRunId: string, goodRunId: string, analyzerVersion?: number): Promise<import("./diff.js").RunDiff | undefined>;
  getDiff?(diffId: string, analyzerVersion?: number): Promise<import("./diff.js").RunDiff | undefined>;
  append(event: AppendDraft): Promise<AppendResult>;
  /** Optional atomic delivery group used by hook adapters. */
  appendBatch?(events: AppendDraft[]): Promise<AppendResult[]>;
  getRun(runId: string): Promise<RunRecord | undefined>;
  listRuns(filter: RunFilter): Promise<Page<RunSummary>>;
  readRun(runId: string, afterSequence?: number): Promise<TraceEnvelopeV1[]>;
  setOutcome(runId: string, outcome: "worked" | "failed" | null): Promise<void>;
  setBookmark(runId: string, bookmark: boolean, label?: string): Promise<void>;
  patchRun(runId: string, patch: RunPatch): Promise<RunRecord | undefined>;
  rebuildSearchIndex(): Promise<void>;
  markInterrupted(before: number, provider?: Provider, runIds?: readonly string[], origin?: RunOrigin): Promise<number>;
  deleteRun(runId: string): Promise<boolean>;
  prune(policy: RetentionPolicy): Promise<number>;
  /** Ordered replay followed by live delivery. Unsubscribe cancels both. */
  subscribe(runId: string, afterSequence: number, listener: Listener): Unsubscribe;
  close(): Promise<void>;
}
