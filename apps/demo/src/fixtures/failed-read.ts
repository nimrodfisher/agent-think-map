import type { AgentTraceEvent } from "@agent-think-map/protocol";

export const failedReadId = "synthetic-config-read";

/** Authored demonstration events, not a real user's run or private reasoning. */
export const failedReadFixture: AgentTraceEvent[] = [
  { type: "run.started", runId: "synthetic-failed-read", prompt: "Explain the application's configuration.", ts: 0 },
  { type: "node.started", id: failedReadId, kind: "tool", title: "Read configuration", operation: { name: "read", providerName: "Read" }, parentId: "user-synthetic-failed-read", ts: 100 },
  { type: "tool.input", id: failedReadId, partial: '{"path":"./config/app.json"}', ts: 110 },
  { type: "node.failed", id: failedReadId, error: "EACCES: permission denied, open './config/app.json'", ts: 180 },
  { type: "node.started", id: "synthetic-answer", kind: "answer", title: "Answer (unverified)", parentId: failedReadId, ts: 240 },
  { type: "node.delta", id: "synthetic-answer", text: "I could not read the configuration file. The application's configuration remains unverified.", ts: 300 },
  { type: "node.completed", id: "synthetic-answer", outputPreview: "I could not read the configuration file. The application's configuration remains unverified.", durationMs: 120, ts: 360 },
  { type: "run.completed", runId: "synthetic-failed-read", ts: 400 },
];
