import { describe, expect, it } from "vitest";
import { reduceTraceAll } from "@agent-think-map/core";
import { ClaudeTraceAdapter } from "./index.js";

function eventsOf(adapter: ClaudeTraceAdapter, messages: unknown[]) {
  return messages.flatMap((message) => adapter.ingest(message));
}

describe("ClaudeTraceAdapter", () => {
  it("opens a run and streams thinking into a thinking node", () => {
    const adapter = new ClaudeTraceAdapter({
      runId: "r1",
      prompt: "Fix the overflow",
      now: () => 10,
    });
    const events = eventsOf(adapter, [
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
    ]);

    expect(events[0]).toMatchObject({ type: "run.started", runId: "r1" });
    const state = reduceTraceAll(events);
    const thinking = state.nodes.find((node) => node.kind === "thinking");
    expect(thinking?.text).toBe("This is a layout bug.");
    expect(thinking?.status).toBe("completed");
  });

  it("classifies Skill, mcp__, and builtin tools with why text", () => {
    const adapter = new ClaudeTraceAdapter({
      runId: "r1",
      prompt: "Open an issue",
      now: () => 20,
    });
    const events = eventsOf(adapter, [
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", id: "toolu_skill", name: "Skill" },
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"skill":"frontend-engineer"}',
          },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop" } },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_skill",
              content: "Use distinctive layout.",
            },
          ],
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: {
            type: "tool_use",
            id: "toolu_mcp",
            name: "mcp__github__create_issue",
          },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop" } },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_mcp",
              content: "Created #41",
            },
          ],
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", id: "toolu_read", name: "Read" },
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"path":"src/Login.tsx"}' },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop" } },
    ]);

    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "skill")?.title).toBe("frontend-engineer");
    expect(state.nodes.find((n) => n.kind === "skill")?.reason).toMatch(/frontend-engineer/);
    expect(state.nodes.find((n) => n.kind === "mcp")?.title).toBe("github / create_issue");
    expect(state.nodes.find((n) => n.kind === "tool")?.reason).toBe("Used Read on src/Login.tsx");
  });

  it("redacts secrets in tool input before emitting", () => {
    const adapter = new ClaudeTraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 30,
    });
    const events = eventsOf(adapter, [
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", id: "t1", name: "Bash" },
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"command":"echo sk-ant-secret123"}',
          },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop" } },
    ]);

    const input = events.find((event) => event.type === "tool.input");
    expect(input && input.type === "tool.input" ? input.partial : "").not.toMatch(
      /sk-ant-secret123/,
    );
  });

  it("emits an answer node and run.completed from a result message", () => {
    const adapter = new ClaudeTraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 40,
    });
    const events = eventsOf(adapter, [
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Opened issue #41" }] },
      },
      { type: "result", result: "Opened issue #41" },
    ]);

    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "answer")?.text).toBe("Opened issue #41");
    expect(state.status).toBe("completed");
  });

  it("nests a Task subagent under its parent tool id", () => {
    const adapter = new ClaudeTraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 50,
    });
    const events = eventsOf(adapter, [
      {
        type: "stream_event",
        parent_tool_use_id: null,
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", id: "task-1", name: "Task" },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop" } },
    ]);

    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "subagent")?.title).toBe("Task");
  });
});
