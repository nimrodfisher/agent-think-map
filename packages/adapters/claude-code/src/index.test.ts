import { describe, expect, it } from "vitest";
import { reduceTraceAll } from "@agent-think-map/core";
import { ClaudeCodeHookAdapter } from "./index.js";

function eventsOf(adapter: ClaudeCodeHookAdapter, hooks: unknown[]) {
  return hooks.flatMap((hook) => adapter.ingest(hook));
}

describe("ClaudeCodeHookAdapter", () => {
  it("opens a session run on the first user prompt", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 10 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Fix the overflow",
      },
    ]);

    expect(events[0]).toMatchObject({
      type: "run.started",
      runId: "sess-1",
      prompt: "Fix the overflow",
      ts: 10,
    });
    const state = reduceTraceAll(events);
    expect(state.nodes[0]).toMatchObject({
      kind: "user",
      text: "Fix the overflow",
    });
  });

  it("starts and completes a classified tool from Pre/PostToolUse", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 20 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Open an issue",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        tool_name: "mcp__github__create_issue",
        tool_use_id: "toolu_1",
        tool_input: { title: "Overflow on mobile" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__github__create_issue",
        tool_use_id: "toolu_1",
        tool_response: { number: 42 },
      },
    ]);

    const state = reduceTraceAll(events);
    const mcp = state.nodes.find((node) => node.kind === "mcp");
    expect(mcp).toMatchObject({
      id: "toolu_1",
      title: "github / create_issue",
      status: "completed",
      input: '{"title":"Overflow on mobile"}',
    });
    expect(mcp?.outputPreview).toBe('{\n  "number": 42\n}');
    expect(mcp?.reason).toMatch(/github/i);
  });

  it("marks a failed tool and appends later prompts without resetting the graph", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 30 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Read layout.css",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_use_id: "toolu_read",
        tool_input: { file_path: "src/layout.css" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUseFailure",
        tool_name: "Read",
        tool_use_id: "toolu_read",
        error_message: "File not found",
      },
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Try src/app.css instead",
      },
    ]);

    const state = reduceTraceAll(events);
    const read = state.nodes.find((node) => node.id === "toolu_read");
    expect(read?.status).toBe("failed");
    expect(read?.error).toBe("File not found");
    const users = state.nodes.filter((node) => node.kind === "user");
    expect(users).toHaveLength(2);
    expect(users[1]?.text).toBe("Try src/app.css instead");
  });

  it("emits an answer on Stop and completes the run on SessionEnd", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 40 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Summarize",
      },
      {
        session_id: "sess-1",
        hook_event_name: "Stop",
        last_assistant_message: "The overflow is in .hero.",
      },
      {
        session_id: "sess-1",
        hook_event_name: "SessionEnd",
      },
    ]);

    const state = reduceTraceAll(events);
    const answer = state.nodes.find((node) => node.kind === "answer");
    expect(answer?.text).toBe("The overflow is in .hero.");
    expect(state.status).toBe("completed");
  });

  it("nests a Skill load and a Task subagent", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 50 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Ship the form",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        tool_name: "Skill",
        tool_use_id: "toolu_skill",
        tool_input: { skill: "frontend-engineer" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_use_id: "toolu_skill",
        tool_response: "Use distinctive layout.",
      },
      {
        session_id: "sess-1",
        hook_event_name: "SubagentStart",
        agent_id: "agent-explore",
        agent_type: "Explore",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        agent_id: "agent-explore",
        tool_name: "Grep",
        tool_use_id: "toolu_grep",
        tool_input: { pattern: "form" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_use_id: "toolu_grep",
        tool_response: "src/form.tsx",
      },
      {
        session_id: "sess-1",
        hook_event_name: "SubagentStop",
        agent_id: "agent-explore",
        last_assistant_message: "Found the form module.",
      },
    ]);

    const state = reduceTraceAll(events);
    const skill = state.nodes.find((node) => node.kind === "skill");
    expect(skill?.title).toBe("frontend-engineer");
    const subagent = state.nodes.find((node) => node.kind === "subagent");
    expect(subagent).toMatchObject({
      id: "agent-explore",
      title: "Explore",
      status: "completed",
    });
    const grep = state.nodes.find((node) => node.id === "toolu_grep");
    expect(grep?.parentId).toBe("agent-explore");
  });

  it("uses the tool description as why, and reports model, effort, and usage", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 80 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Which warehouse?",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "toolu_bash",
        effort: { level: "high" },
        model: "claude-sonnet-5",
        tool_input: {
          command: "grep -r Snowflake",
          description: "Search the repo for warehouse names",
        },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_use_id: "toolu_bash",
        tool_response: {
          stdout: "none",
          usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 40 },
          total_cost_usd: 0.02,
        },
      },
    ]);

    const state = reduceTraceAll(events);
    const bash = state.nodes.find((node) => node.id === "toolu_bash");
    expect(bash?.reason).toBe("Search the repo for warehouse names");
    expect(state.model).toBe("claude-sonnet-5");
    expect(state.effort).toBe("high");
    expect(state.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cacheReadTokens: 40,
      costUsd: 0.02,
    });
    expect(bash?.usage).toEqual(state.usage);
  });

  it("parents parallel tools as siblings under the user, not a chain", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 60 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Which tools are in use?",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "toolu_a",
        tool_input: { command: "grep Snowflake" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "toolu_b",
        tool_input: { command: "grep BigQuery" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_use_id: "toolu_a",
        tool_response: "none",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_use_id: "toolu_b",
        tool_response: "none",
      },
    ]);

    const state = reduceTraceAll(events);
    const user = state.nodes.find((node) => node.kind === "user");
    const a = state.nodes.find((node) => node.id === "toolu_a");
    const b = state.nodes.find((node) => node.id === "toolu_b");
    expect(a?.parentId).toBe(user?.id);
    expect(b?.parentId).toBe(user?.id);
    expect(a?.parentId).not.toBe("toolu_b");
    expect(b?.parentId).not.toBe("toolu_a");
  });

  it("parents parallel subagents to the user and nests parallel tools under each", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 70 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Explore both sides",
      },
      {
        session_id: "sess-1",
        hook_event_name: "SubagentStart",
        agent_id: "agent-a",
        agent_type: "Explore",
      },
      {
        session_id: "sess-1",
        hook_event_name: "SubagentStart",
        agent_id: "agent-b",
        agent_type: "Explore",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        agent_id: "agent-a",
        tool_name: "Grep",
        tool_use_id: "toolu_a1",
        tool_input: { pattern: "one" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        agent_id: "agent-a",
        tool_name: "Grep",
        tool_use_id: "toolu_a2",
        tool_input: { pattern: "two" },
      },
      {
        session_id: "sess-1",
        hook_event_name: "PreToolUse",
        agent_id: "agent-b",
        tool_name: "Read",
        tool_use_id: "toolu_b1",
        tool_input: { file_path: "a.md" },
      },
    ]);

    const state = reduceTraceAll(events);
    const user = state.nodes.find((node) => node.kind === "user");
    const agentA = state.nodes.find((node) => node.id === "agent-a");
    const agentB = state.nodes.find((node) => node.id === "agent-b");
    expect(agentA?.parentId).toBe(user?.id);
    expect(agentB?.parentId).toBe(user?.id);
    expect(state.nodes.find((node) => node.id === "toolu_a1")?.parentId).toBe("agent-a");
    expect(state.nodes.find((node) => node.id === "toolu_a2")?.parentId).toBe("agent-a");
    expect(state.nodes.find((node) => node.id === "toolu_b1")?.parentId).toBe("agent-b");
  });

  it("captures model from the opening prompt hook", () => {
    const adapter = new ClaudeCodeHookAdapter({ now: () => 85 });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Which warehouse?",
        model: "claude-sonnet-5",
      },
    ]);
    expect(reduceTraceAll(events).model).toBe("claude-sonnet-5");
  });

  it("reads the model from the transcript when hooks omit it", () => {
    const adapter = new ClaudeCodeHookAdapter({
      now: () => 91,
      readTranscript: () =>
        `${JSON.stringify({
          type: "assistant",
          message: { model: "claude-sonnet-5" },
        })}\n`,
    });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Count rows",
        transcript_path: "/tmp/sess.jsonl",
      },
    ]);
    expect(reduceTraceAll(events).model).toBe("claude-sonnet-5");
  });

  it("uses transcript usage as the run total when tool hooks omit tokens", () => {
    const adapter = new ClaudeCodeHookAdapter({
      now: () => 90,
      readTranscript: () =>
        `${JSON.stringify({
          type: "assistant",
          message: {
            usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 40 },
          },
        })}\n`,
    });
    const events = eventsOf(adapter, [
      {
        session_id: "sess-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Count rows",
        transcript_path: "/tmp/sess.jsonl",
      },
      {
        session_id: "sess-1",
        hook_event_name: "PostToolUse",
        tool_use_id: "toolu_sql",
        tool_response: { stdout: "3" },
        transcript_path: "/tmp/sess.jsonl",
      },
    ]);
    const state = reduceTraceAll(events);
    expect(state.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cacheReadTokens: 40,
    });
  });
});
