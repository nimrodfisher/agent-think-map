import { ClaudeTraceAdapter } from "../../claude-sdk/src/index.js";
import type { AgentTraceEvent } from "../../../protocol/src/index.js";

export { ClaudeTraceAdapter };

/** Kind written to NanoClaw outbound.db `messages_out`. */
export const TRACE_MESSAGE_KIND = "trace" as const;

export interface TraceRow {
  kind: typeof TRACE_MESSAGE_KIND;
  payload: AgentTraceEvent;
}

export function toTraceRow(event: AgentTraceEvent): TraceRow {
  return { kind: TRACE_MESSAGE_KIND, payload: event };
}

export function formatSse(event: AgentTraceEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Wrap a Claude Agent SDK async iterator and yield protocol events.
 * NanoClaw's agent-runner can write each event as a `kind: "trace"` row.
 */
export async function* traceClaudeQuery(
  messages: AsyncIterable<unknown>,
  options: { runId: string; prompt: string },
): AsyncGenerator<AgentTraceEvent> {
  const adapter = new ClaudeTraceAdapter(options);
  for await (const message of messages) {
    for (const event of adapter.ingest(message)) {
      yield event;
    }
  }
}
