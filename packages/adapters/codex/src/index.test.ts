import { describe, expect, it } from "vitest";
import { reduceTraceAll } from "@agent-think-map/core";
import { CodexHookAdapter } from "./index.js";

function eventsOf(adapter: CodexHookAdapter, hooks: unknown[]) {
  return hooks.flatMap((hook) => adapter.ingest(hook));
}

describe("CodexHookAdapter", () => {
  it("opens a run on UserPromptSubmit and tags the Codex model", () => {
    const adapter = new CodexHookAdapter({ now: () => 10 });
    const events = eventsOf(adapter, [
      {
        session_id: "thr_1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Inspect Login.tsx",
        model: "gpt-5.4",
      },
    ]);
    expect(events[0]).toMatchObject({
      type: "run.started",
      runId: "thr_1",
      prompt: "Inspect Login.tsx",
      ts: 10,
    });
    expect(events.some((e) => e.type === "run.meta" && e.model === "gpt-5.4")).toBe(true);
  });

  it("maps Bash Pre/PostToolUse and MCP names", () => {
    const adapter = new CodexHookAdapter({ now: () => 20 });
    const events = eventsOf(adapter, [
      {
        session_id: "thr_1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Open an issue",
      },
      {
        session_id: "thr_1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "call_1",
        tool_input: { command: "cat src/Login.tsx" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PostToolUse",
        tool_use_id: "call_1",
        tool_response: { exit_code: 0, output: "export function Login()" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PreToolUse",
        tool_name: "mcp__github__create_issue",
        tool_use_id: "call_2",
        tool_input: { title: "overflow" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PostToolUse",
        tool_use_id: "call_2",
        tool_response: { number: 41 },
      },
    ]);
    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "tool")).toMatchObject({
      id: "call_1",
      title: "cat",
      status: "completed",
    });
    expect(state.nodes.find((n) => n.kind === "mcp")).toMatchObject({
      id: "call_2",
      title: "github / create_issue",
      status: "completed",
    });
  });

  it("fails a Bash node when exit_code is non-zero", () => {
    const adapter = new CodexHookAdapter({ now: () => 30 });
    const events = eventsOf(adapter, [
      { session_id: "thr_1", hook_event_name: "UserPromptSubmit", prompt: "run" },
      {
        session_id: "thr_1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "call_1",
        tool_input: { command: "false" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PostToolUse",
        tool_use_id: "call_1",
        tool_response: { exit_code: 1, output: "failed" },
      },
    ]);
    const node = reduceTraceAll(events).nodes.find((n) => n.id === "call_1");
    expect(node?.status).toBe("failed");
  });

  it("completes the run on SessionEnd and draws the Stop answer", () => {
    const adapter = new CodexHookAdapter({ now: () => 40 });
    const events = eventsOf(adapter, [
      { session_id: "thr_1", hook_event_name: "UserPromptSubmit", prompt: "summarize" },
      {
        session_id: "thr_1",
        hook_event_name: "Stop",
        last_assistant_message: "Login exports a component.",
      },
      { session_id: "thr_1", hook_event_name: "SessionEnd", reason: "other" },
    ]);
    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "answer")?.text).toBe(
      "Login exports a component.",
    );
    expect(events.some((e) => e.type === "run.completed" && e.runId === "thr_1")).toBe(
      true,
    );
  });
});
