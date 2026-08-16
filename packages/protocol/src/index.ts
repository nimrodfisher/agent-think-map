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

export const runStartedSchema = z.object({
  type: z.literal("run.started"),
  runId: z.string(),
  prompt: z.string(),
  ts: z.number(),
});

export const nodeStartedSchema = z.object({
  type: z.literal("node.started"),
  id: z.string(),
  kind: nodeKindSchema,
  title: z.string(),
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
  ts: z.number(),
});

export const nodeFailedSchema = z.object({
  type: z.literal("node.failed"),
  id: z.string(),
  error: z.string(),
  ts: z.number(),
});

export const runCompletedSchema = z.object({
  type: z.literal("run.completed"),
  runId: z.string(),
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
]);

export type AgentTraceEvent = z.infer<typeof agentTraceEventSchema>;
export type RunStartedEvent = z.infer<typeof runStartedSchema>;
export type NodeStartedEvent = z.infer<typeof nodeStartedSchema>;
export type NodeDeltaEvent = z.infer<typeof nodeDeltaSchema>;
export type ToolInputEvent = z.infer<typeof toolInputSchema>;
export type NodeCompletedEvent = z.infer<typeof nodeCompletedSchema>;
export type NodeFailedEvent = z.infer<typeof nodeFailedSchema>;
export type RunCompletedEvent = z.infer<typeof runCompletedSchema>;

export function parseAgentTraceEvent(input: unknown): AgentTraceEvent {
  const result = agentTraceEventSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Invalid AgentTraceEvent");
  }
  return result.data;
}
