import { describe, expect, it } from "vitest";
import { reduceTraceAll } from "@agent-think-map/core";
import { CodexTraceAdapter, OpenAITraceAdapter } from "./index.js";

function eventsOf(adapter: OpenAITraceAdapter, messages: unknown[]) {
  return messages.flatMap((message) => adapter.ingest(message));
}

describe("OpenAITraceAdapter", () => {
  it("is exported as CodexTraceAdapter", () => {
    expect(CodexTraceAdapter).toBe(OpenAITraceAdapter);
  });

  it("streams JS Agents SDK reasoning, tools, MCP, handoff, and usage", () => {
    const adapter = new OpenAITraceAdapter({
      runId: "r1",
      prompt: "Open a GitHub issue",
      now: () => 10,
    });
    const events = eventsOf(adapter, [
      {
        type: "raw_model_stream_event",
        data: { type: "response.reasoning_summary_text.delta", delta: "Need a frontend skill. " },
      },
      {
        type: "run_item_stream_event",
        name: "reasoning_item_created",
        item: { type: "reasoning_item", id: "rs-1" },
      },
      {
        type: "run_item_stream_event",
        name: "tool_called",
        item: {
          type: "tool_call_item",
          raw_item: {
            type: "function_call",
            call_id: "call_read",
            name: "Read",
            arguments: '{"path":"src/Login.tsx"}',
          },
        },
      },
      {
        type: "run_item_stream_event",
        name: "tool_output",
        item: {
          type: "tool_call_output_item",
          raw_item: { call_id: "call_read" },
          output: "export function Login() {",
        },
      },
      {
        type: "run_item_stream_event",
        name: "tool_called",
        item: {
          type: "tool_call_item",
          rawItem: {
            type: "mcp_call",
            id: "mcp_1",
            server_label: "github",
            name: "create_issue",
            arguments: '{"title":"overflow"}',
          },
        },
      },
      {
        type: "run_item_stream_event",
        name: "tool_output",
        item: {
          type: "tool_call_output_item",
          call_id: "mcp_1",
          output: "Created #41",
        },
      },
      {
        type: "agent_updated_stream_event",
        agent: { name: "Issue Writer" },
      },
      {
        type: "run_item_stream_event",
        name: "message_output_created",
        item: {
          type: "message_output_item",
          raw_item: {
            content: [{ type: "output_text", text: "Opened issue #41" }],
          },
        },
      },
      {
        type: "raw_model_stream_event",
        data: {
          type: "response.completed",
          response: {
            usage: { input_tokens: 900, output_tokens: 120, cached_tokens: 40 },
          },
        },
      },
    ]);

    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "thinking")?.text).toBe("Need a frontend skill. ");
    expect(state.nodes.find((n) => n.kind === "tool")?.reason).toBe("Used Read on src/Login.tsx");
    expect(state.nodes.find((n) => n.kind === "mcp")?.title).toBe("github / create_issue");
    expect(state.nodes.find((n) => n.kind === "subagent")?.title).toBe("Issue Writer");
    expect(state.nodes.find((n) => n.kind === "answer")?.text).toBe("Opened issue #41");
    expect(state.usage).toEqual({
      inputTokens: 900,
      outputTokens: 120,
      cacheReadTokens: 40,
    });
    expect(state.status).toBe("completed");
  });

  it("accepts Python Agents SDK raw_response_event names", () => {
    const adapter = new OpenAITraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 20,
    });
    const events = eventsOf(adapter, [
      {
        type: "raw_response_event",
        data: { type: "response.output_text.delta", delta: "Hello" },
      },
      {
        type: "run_item_stream_event",
        name: "handoff_occured",
        item: { type: "handoff_call", id: "h1", name: "transfer_to_refund_agent" },
      },
    ]);

    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "answer")?.text).toBe("Hello");
    expect(state.nodes.find((n) => n.kind === "subagent")?.title).toBe("transfer_to_refund_agent");
  });

  it("maps Codex app-server item notifications and turn usage", () => {
    const adapter = new OpenAITraceAdapter({
      runId: "r1",
      prompt: "Inspect Login.tsx",
      now: () => 30,
    });
    const events = eventsOf(adapter, [
      {
        method: "item/started",
        params: { item: { id: "reason-1", type: "reasoning" } },
      },
      {
        method: "item/agentMessage/delta",
        params: { itemId: "reason-1", delta: "This is a layout bug." },
      },
      {
        method: "item/completed",
        params: { item: { id: "reason-1", type: "reasoning" } },
      },
      {
        method: "item/started",
        params: {
          item: { id: "cmd-1", type: "commandExecution", command: "cat src/Login.tsx" },
        },
      },
      {
        method: "item/completed",
        params: {
          item: {
            id: "cmd-1",
            type: "command_execution",
            command: "cat src/Login.tsx",
            output: "export function Login()",
          },
        },
      },
      {
        method: "item/completed",
        params: {
          item: {
            id: "mcp-1",
            type: "mcpToolCall",
            server: "github",
            tool: "create_issue",
            output: "Created #41",
          },
        },
      },
      {
        method: "turn/completed",
        params: {
          usage: { input_tokens: 410, output_tokens: 88, total_cost_usd: 0.012 },
        },
      },
    ]);

    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "thinking")?.text).toBe("This is a layout bug.");
    expect(state.nodes.find((n) => n.kind === "tool")?.title).toBe("cat");
    expect(state.nodes.find((n) => n.kind === "mcp")?.title).toBe("github / create_issue");
    expect(state.usage).toEqual({
      inputTokens: 410,
      outputTokens: 88,
      costUsd: 0.012,
    });
  });

  it("redacts secrets in OpenAI tool arguments", () => {
    const adapter = new OpenAITraceAdapter({
      runId: "r1",
      prompt: "x",
      now: () => 40,
    });
    const events = eventsOf(adapter, [
      {
        type: "run_item_stream_event",
        name: "tool_called",
        item: {
          type: "tool_call_item",
          raw_item: {
            call_id: "c1",
            name: "Bash",
            arguments: '{"command":"echo sk-ant-secret123"}',
          },
        },
      },
    ]);
    const input = events.find((event) => event.type === "tool.input");
    expect(input && input.type === "tool.input" ? input.partial : "").not.toMatch(
      /sk-ant-secret123/,
    );
  });
});
