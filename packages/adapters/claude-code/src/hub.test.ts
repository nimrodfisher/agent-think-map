import { describe, expect, it } from "vitest";
import { ClaudeCodeTraceHub, claudeCodeHookSettings, mergeClaudeCodeSettings } from "./hub.js";

describe("ClaudeCodeTraceHub", () => {
  it("keeps sessions isolated and replays events to late subscribers", () => {
    const hub = new ClaudeCodeTraceHub({ now: () => 11 });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
    });
    hub.ingest({
      session_id: "b",
      hook_event_name: "UserPromptSubmit",
      prompt: "Open issue",
    });

    const replayed: string[] = [];
    hub.subscribe("a", (event) => {
      if (event.type === "run.started") replayed.push(event.prompt);
    });

    expect(replayed).toEqual(["Fix overflow"]);
    expect(hub.list()).toEqual([
      expect.objectContaining({ id: "a", prompt: "Fix overflow", live: true }),
      expect.objectContaining({ id: "b", prompt: "Open issue", live: true }),
    ]);
  });

  it("surfaces model from the transcript when hooks omit it", () => {
    const hub = new ClaudeCodeTraceHub({
      now: () => 15,
      readTranscript: () =>
        JSON.stringify({
          type: "assistant",
          message: { model: "claude-sonnet-5" },
        }),
    });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
      transcript_path: "/tmp/sess.jsonl",
    });
    expect(hub.list()[0]).toMatchObject({
      id: "a",
      model: "claude-sonnet-5",
    });
  });

  it("surfaces model, effort, and usage on the session list", () => {
    const hub = new ClaudeCodeTraceHub({ now: () => 13 });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
    });
    hub.ingest({
      session_id: "a",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "toolu_1",
      model: "claude-sonnet-5",
      effort: { level: "high" },
      tool_input: { file_path: "a.css", description: "Read the stylesheet" },
    });
    hub.ingest({
      session_id: "a",
      hook_event_name: "PostToolUse",
      tool_use_id: "toolu_1",
      tool_response: { usage: { input_tokens: 100, output_tokens: 20 } },
    });
    expect(hub.list()[0]).toMatchObject({
      id: "a",
      model: "claude-sonnet-5",
      effort: "high",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("forwards live events after subscribe", () => {
    const hub = new ClaudeCodeTraceHub({ now: () => 12 });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
    });
    const types: string[] = [];
    const stop = hub.subscribe("a", (event) => {
      types.push(event.type);
    });
    hub.ingest({
      session_id: "a",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "toolu_1",
      tool_input: { file_path: "a.css" },
    });
    stop();
    hub.ingest({
      session_id: "a",
      hook_event_name: "PostToolUse",
      tool_use_id: "toolu_1",
      tool_response: "ok",
    });
    expect(types).toContain("node.started");
    expect(types.filter((type) => type === "node.completed")).toHaveLength(0);
  });

  it("drops a session from the list", () => {
    const hub = new ClaudeCodeTraceHub({ now: () => 14 });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
    });
    hub.ingest({
      session_id: "b",
      hook_event_name: "UserPromptSubmit",
      prompt: "Open issue",
    });
    expect(hub.drop("a")).toBe(true);
    expect(hub.list().map((session) => session.id)).toEqual(["b"]);
    expect(hub.drop("missing")).toBe(false);
  });
});

describe("claudeCodeHookSettings", () => {
  it("emits HTTP hooks for the studio URL without blocking Stop", () => {
    const settings = claudeCodeHookSettings("http://127.0.0.1:3334/hook");
    expect(settings.hooks.UserPromptSubmit[0].hooks[0]).toMatchObject({
      type: "http",
      url: "http://127.0.0.1:3334/hook",
      timeout: 5,
    });
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  it("merges into existing local settings without dropping other hooks", () => {
    const merged = mergeClaudeCodeSettings(
      {
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }],
        },
      },
      "http://127.0.0.1:3334/hook",
    );
    const pre = merged.hooks.PreToolUse;
    expect(pre).toHaveLength(2);
    expect(pre[0].hooks[0].command).toBe("echo hi");
    expect(pre[1].hooks[0].url).toBe("http://127.0.0.1:3334/hook");
  });
});
