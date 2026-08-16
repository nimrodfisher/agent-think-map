import { describe, expect, it } from "vitest";
import { formatSse, toTraceRow, TRACE_MESSAGE_KIND } from "./index.js";

describe("NanoClaw trace transport", () => {
  it("wraps events as kind:trace rows for outbound.db", () => {
    const event = {
      type: "run.started" as const,
      runId: "r1",
      prompt: "hi",
      ts: 1,
    };
    expect(toTraceRow(event)).toEqual({
      kind: TRACE_MESSAGE_KIND,
      payload: event,
    });
  });

  it("formats SSE frames a host webhook can flush", () => {
    const frame = formatSse({
      type: "run.completed",
      runId: "r1",
      ts: 2,
    });
    expect(frame).toBe('data: {"type":"run.completed","runId":"r1","ts":2}\n\n');
  });
});
