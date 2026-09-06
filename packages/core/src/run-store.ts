import type { Provider, TraceEnvelopeV1, TraceUsage } from "../../protocol/src/index.js";

export type RunStatus = "running" | "completed" | "failed" | "interrupted";
export type AppendDraft = Pick<TraceEnvelopeV1, "schemaVersion" | "eventId" | "provider" | "sessionId" | "timestamp" | "payload"> & { sequence?: number; [key: string]: unknown };
export type AppendResult = { envelope: TraceEnvelopeV1; inserted: boolean };
export interface RunSummary {
  runId: string; provider: Provider; sessionId: string; schemaVersion: number;
  prompt: string; status: RunStatus; startedAt?: number; endedAt?: number;
  updatedAt: number; model?: string; effort?: string; usage?: TraceUsage;
  outcome: "worked" | "failed" | null; bookmarked: boolean; label?: string;
  eventCount: number;
}
export interface RunRecord extends RunSummary { byteSize: number }
export interface RunFilter {
  q?: string; provider?: Provider; model?: string; status?: RunStatus;
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
  markInterrupted(before: number, provider?: Provider): Promise<number>;
  deleteRun(runId: string): Promise<boolean>;
  prune(policy: RetentionPolicy): Promise<number>;
  /** Ordered replay followed by live delivery. Unsubscribe cancels both. */
  subscribe(runId: string, afterSequence: number, listener: Listener): Unsubscribe;
  close(): Promise<void>;
}
