import { z } from "zod";

export const nodeKindSchema = z.enum([
  "user",
  "thinking",
  "skill",
  "mcp",
  "tool",
  "subagent",
  "result",
  "answer",
]);

export type NodeKind = z.infer<typeof nodeKindSchema>;

export const usageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  costUsd: z.number().optional(),
});

export type TraceUsage = z.infer<typeof usageSchema>;

export const runStartedSchema = z.object({
  type: z.literal("run.started"),
  runId: z.string(),
  prompt: z.string(),
  ts: z.number(),
});

export const operationSchema = z.object({ name: z.string().min(1), server: z.string().optional(), providerName: z.string().optional() });
export type CanonicalOperation = z.infer<typeof operationSchema>;

/** Capture from the provider name, never from a summarized display title. */
export function operationFromName(providerName: string): CanonicalOperation {
  const mcp = providerName.match(/^mcp__(.+?)__(.+)$/i);
  return mcp ? {name: `${mcp[1].toLowerCase()}.${mcp[2].toLowerCase()}`, server: mcp[1].toLowerCase(), providerName}
    : {name: providerName.toLowerCase(), providerName};
}

export const nodeStartedSchema = z.object({
  type: z.literal("node.started"),
  id: z.string(),
  kind: nodeKindSchema,
  title: z.string(),
  operation: operationSchema.optional(),
  parentId: z.string().optional(),
  reason: z.string().optional(),
  ts: z.number(),
});

export const nodeDeltaSchema = z.object({
  type: z.literal("node.delta"),
  id: z.string(),
  text: z.string(),
  ts: z.number(),
});

export const toolInputSchema = z.object({
  type: z.literal("tool.input"),
  id: z.string(),
  partial: z.string(),
  ts: z.number(),
});

export const nodeCompletedSchema = z.object({
  type: z.literal("node.completed"),
  id: z.string(),
  outputPreview: z.string().optional(),
  durationMs: z.number().optional(),
  usage: usageSchema.optional(),
  ts: z.number(),
});

export const nodeFailedSchema = z.object({
  type: z.literal("node.failed"),
  id: z.string(),
  error: z.string(),
  usage: usageSchema.optional(),
  ts: z.number(),
});

export const runCompletedSchema = z.object({
  type: z.literal("run.completed"),
  runId: z.string(),
  usage: usageSchema.optional(),
  ts: z.number(),
});

export const runMetaSchema = z.object({
  type: z.literal("run.meta"),
  runId: z.string(),
  model: z.string().optional(),
  effort: z.string().optional(),
  usage: usageSchema.optional(),
  ts: z.number(),
});

export const agentTraceEventSchema = z.discriminatedUnion("type", [
  runStartedSchema,
  nodeStartedSchema,
  nodeDeltaSchema,
  toolInputSchema,
  nodeCompletedSchema,
  nodeFailedSchema,
  runCompletedSchema,
  runMetaSchema,
]);

export type AgentTraceEvent = z.infer<typeof agentTraceEventSchema>;
export type RunStartedEvent = z.infer<typeof runStartedSchema>;
export type NodeStartedEvent = z.infer<typeof nodeStartedSchema>;
export type NodeDeltaEvent = z.infer<typeof nodeDeltaSchema>;
export type ToolInputEvent = z.infer<typeof toolInputSchema>;
export type NodeCompletedEvent = z.infer<typeof nodeCompletedSchema>;
export type NodeFailedEvent = z.infer<typeof nodeFailedSchema>;
export type RunCompletedEvent = z.infer<typeof runCompletedSchema>;
export type RunMetaEvent = z.infer<typeof runMetaSchema>;

export function parseAgentTraceEvent(input: unknown): AgentTraceEvent {
  const result = agentTraceEventSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Invalid AgentTraceEvent");
  }
  return result.data;
}

export const providerSchema = z.enum(["claude-code", "codex", "claude-sdk", "openai", "custom"]);
export type Provider = z.infer<typeof providerSchema>;
export type TraceEnvelopeV1 = {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  provider: Provider;
  sessionId: string;
  timestamp: number;
  payload: AgentTraceEvent;
  [key: string]: unknown;
};
export interface TraceEnvelopeContext {
  provider: Provider;
  sessionId: string;
  eventId?: string;
  /** A producer delivery ID, never a hash of text or a node ID alone. */
  stableId?: string;
  sequence?: number;
}
const envelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.string().min(1),
  sequence: z.number().int().nonnegative().safe(), provider: providerSchema,
  sessionId: z.string().min(1), timestamp: z.number().finite(), payload: z.unknown(),
}).passthrough();

export function parseTraceEnvelope(input: unknown, context: TraceEnvelopeContext): TraceEnvelopeV1 {
  if (input && typeof input === "object" && "schemaVersion" in input) {
    const envelope = envelopeSchema.parse(input);
    parseAgentTraceEvent(envelope.payload);
    // Validate without projecting: nested extensions survive a JSON round trip.
    return envelope as TraceEnvelopeV1;
  }
  const payload = parseAgentTraceEvent(input);
  const supplied = context.eventId ?? context.stableId;
  return envelopeSchema.parse({
    schemaVersion: 1,
    eventId: context.eventId ?? (context.stableId
      ? JSON.stringify([context.provider, context.sessionId, context.stableId])
      : globalThis.crypto.randomUUID()),
    eventIdProvenance: supplied ? (context.eventId ? "producer" : "stable-provider-id") : "generated-unique",
    sequence: context.sequence ?? 0, provider: context.provider,
    sessionId: context.sessionId, timestamp: payload.ts, payload: input,
  }) as TraceEnvelopeV1;
}
