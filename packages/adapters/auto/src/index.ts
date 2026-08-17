import type { AgentTraceEvent } from "../../../protocol/src/index.js";
import { ClaudeTraceAdapter } from "../../claude-sdk/src/index.js";
import { OpenAITraceAdapter } from "../../openai/src/index.js";

export interface TraceAdapterOptions {
  runId: string;
  prompt: string;
  now?: () => number;
}

export type TraceSource = "claude" | "openai";

type InnerAdapter = ClaudeTraceAdapter | OpenAITraceAdapter;

const OPENAI_TYPES = new Set([
  "raw_model_stream_event",
  "raw_response_event",
  "run_item_stream_event",
  "agent_updated_stream_event",
]);

const CLAUDE_TYPES = new Set(["stream_event", "assistant", "user", "result", "system"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function detectTraceSource(message: unknown): TraceSource | undefined {
  const msg = asRecord(message);
  if (!msg) return undefined;
  if (typeof msg.method === "string") return "openai";

  const type = asString(msg.type);
  if (!type) return undefined;
  if (OPENAI_TYPES.has(type)) return "openai";
  if (type === "notification" && typeof msg.method === "string") return "openai";
  if (
    type.startsWith("item/") ||
    type.startsWith("item.") ||
    type.startsWith("turn/") ||
    type.startsWith("turn.") ||
    type.startsWith("thread/") ||
    type.startsWith("thread.")
  ) {
    return "openai";
  }
  if (CLAUDE_TYPES.has(type)) return "claude";
  return undefined;
}

export class TraceAdapter {
  source: TraceSource | undefined;
  private inner: InnerAdapter | undefined;
  private readonly pending: unknown[] = [];
  private readonly options: TraceAdapterOptions;

  constructor(options: TraceAdapterOptions) {
    this.options = options;
  }

  ingest(message: unknown): AgentTraceEvent[] {
    if (this.inner) return this.inner.ingest(message);

    const source = detectTraceSource(message);
    if (!source) {
      this.pending.push(message);
      return [];
    }

    this.source = source;
    this.inner =
      source === "claude"
        ? new ClaudeTraceAdapter(this.options)
        : new OpenAITraceAdapter(this.options);

    const buffered = this.pending.splice(0);
    return [...buffered, message].flatMap((item) => this.inner!.ingest(item));
  }
}
