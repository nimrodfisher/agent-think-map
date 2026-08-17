import { describe, expect, it } from "vitest";
import { reduceTraceAll } from "@agent-think-map/core";
import { TraceAdapter } from "./index.js";

describe("TraceAdapter", () => {
  it("adopts Claude Agent SDK events without an import switch", () => {
    const adapter = new TraceAdapter({
      runId: "r1",
      prompt: "Fix the overflow",
      now: () => 10,
    });
    const events = [
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "thinking" },
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "This is a layout bug." },
        },
      },
      {
        type: "stream_event",
        event: { type: "content_block_stop" },
      },
    ].flatMap((message) => adapter.ingest(message));

    expect(adapter.source).toBe("claude");
    expect(events[0]).toMatchObject({ type: "run.started", runId: "r1" });
    expect(reduceTraceAll(events).nodes.find((node) => node.kind === "thinking")?.text).toBe(
      "This is a layout bug.",
    );
  });

  it("adopts Codex app-server JSON-RPC", () => {
    const adapter = new TraceAdapter({
      runId: "r1",
      prompt: "Inspect Login.tsx",
      now: () => 30,
    });
    const events = adapter.ingest({
      jsonrpc: "2.0",
      method: "item/started",
      params: { item: { id: "reason-1", type: "reasoning" } },
    });
    events.push(
      ...adapter.ingest({
        method: "item/agentMessage/delta",
        params: { itemId: "reason-1", delta: "Need a frontend skill." },
      }),
    );

    expect(adapter.source).toBe("openai");
    expect(reduceTraceAll(events).nodes.find((node) => node.kind === "thinking")?.text).toBe(
      "Need a frontend skill.",
    );
  });

  it("adopts OpenAI Agents SDK stream events", () => {
    const adapter = new TraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 20,
    });
    const events = adapter.ingest({
      type: "raw_model_stream_event",
      data: { type: "response.output_text.delta", delta: "Opened issue #41" },
    });

    expect(adapter.source).toBe("openai");
    expect(reduceTraceAll(events).nodes.find((node) => node.kind === "answer")?.text).toBe(
      "Opened issue #41",
    );
  });

  it("buffers until the live stream identifies itself, then stays locked", () => {
    const adapter = new TraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 40,
    });

    expect(adapter.ingest({ ping: true })).toEqual([]);
    expect(adapter.source).toBeUndefined();

    const events = adapter.ingest({
      type: "run_item_stream_event",
      name: "tool_called",
      item: {
        type: "tool_call_item",
        raw_item: { call_id: "c1", name: "Read", arguments: '{"path":"src/Login.tsx"}' },
      },
    });

    expect(adapter.source).toBe("openai");
    expect(events[0]).toMatchObject({ type: "run.started" });
    expect(reduceTraceAll(events).nodes.find((node) => node.kind === "tool")?.title).toBe("Read");

    adapter.ingest({
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "thinking" },
      },
    });
    expect(adapter.source).toBe("openai");
  });
});
