import { describe, expect, it } from "vitest";
import {
  classifyToolName,
  githubIssueFixture,
  initialTraceState,
  reasonFor,
  redactSecrets,
  reduceTrace,
  reduceTraceAll,
} from "./index.js";
import type { AgentTraceEvent } from "@agent-think-map/protocol";

const run: AgentTraceEvent = {
  type: "run.started",
  runId: "run-1",
  prompt: "File a GitHub issue for the login overflow",
  ts: 1000,
};

describe("reduceTrace", () => {
  it("creates a running run and a user node from run.started", () => {
    const state = reduceTrace(initialTraceState, run);

    expect(state.runId).toBe("run-1");
    expect(state.prompt).toBe("File a GitHub issue for the login overflow");
    expect(state.status).toBe("running");
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]).toMatchObject({
      id: "user-run-1",
      kind: "user",
      title: "User",
      status: "completed",
      text: "File a GitHub issue for the login overflow",
    });
    expect(state.activeNodeId).toBe("user-run-1");
  });

  it("appends a child node and an edge from its parent", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "think-1",
        kind: "thinking",
        title: "Thinking",
        parentId: "user-run-1",
        ts: 1001,
      },
    ]);

    expect(state.nodes.map((n) => n.id)).toEqual(["user-run-1", "think-1"]);
    expect(state.edges).toEqual([
      { id: "user-run-1->think-1", source: "user-run-1", target: "think-1" },
    ]);
    expect(state.activeNodeId).toBe("think-1");
    expect(state.selectedNodeId).toBe("think-1");
  });

  it("appends streaming text onto an existing node", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "think-1",
        kind: "thinking",
        title: "Thinking",
        parentId: "user-run-1",
        ts: 1001,
      },
      { type: "node.delta", id: "think-1", text: "This looks like a UI bug. ", ts: 1002 },
      { type: "node.delta", id: "think-1", text: "I should load the frontend skill.", ts: 1003 },
    ]);

    expect(state.nodes.find((n) => n.id === "think-1")?.text).toBe(
      "This looks like a UI bug. I should load the frontend skill.",
    );
  });

  it("records tool input, completion, and duration", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "tool-1",
        kind: "tool",
        title: "Read",
        parentId: "user-run-1",
        ts: 1100,
      },
      { type: "tool.input", id: "tool-1", partial: '{"path":"src/Login.tsx"}', ts: 1101 },
      {
        type: "node.completed",
        id: "tool-1",
        outputPreview: "export function Login() {",
        durationMs: 42,
        ts: 1142,
      },
    ]);

    const node = state.nodes.find((n) => n.id === "tool-1");
    expect(node).toMatchObject({
      status: "completed",
      input: '{"path":"src/Login.tsx"}',
      outputPreview: "export function Login() {",
      durationMs: 42,
    });
  });

  it("marks a node failed and the run failed when a node errors", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "mcp-1",
        kind: "mcp",
        title: "github / create_issue",
        parentId: "user-run-1",
        ts: 1200,
      },
      { type: "node.failed", id: "mcp-1", error: "403: resource not accessible", ts: 1205 },
    ]);

    expect(state.nodes.find((n) => n.id === "mcp-1")?.status).toBe("failed");
    expect(state.nodes.find((n) => n.id === "mcp-1")?.error).toBe(
      "403: resource not accessible",
    );
    expect(state.status).toBe("failed");
  });

  it("records usage on a completed node and on the run", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "answer-1",
        kind: "answer",
        title: "Answer",
        parentId: "user-run-1",
        ts: 1300,
      },
      {
        type: "node.completed",
        id: "answer-1",
        outputPreview: "Opened issue #41",
        usage: { outputTokens: 52, costUsd: 0.0012 },
        ts: 1301,
      },
      {
        type: "run.completed",
        runId: "run-1",
        usage: { inputTokens: 1204, outputTokens: 318, costUsd: 0.041 },
        ts: 1302,
      },
    ]);

    expect(state.nodes.find((n) => n.id === "answer-1")?.usage).toEqual({
      outputTokens: 52,
      costUsd: 0.0012,
    });
    expect(state.usage).toEqual({
      inputTokens: 1204,
      outputTokens: 318,
      costUsd: 0.041,
    });
  });

  it("attaches run usage to an answer node that has none", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "answer-1",
        kind: "answer",
        title: "Answer",
        parentId: "user-run-1",
        ts: 1300,
      },
      { type: "node.completed", id: "answer-1", outputPreview: "Opened issue #41", ts: 1301 },
      {
        type: "run.completed",
        runId: "run-1",
        usage: { inputTokens: 1840, outputTokens: 318, costUsd: 0.041 },
        ts: 1302,
      },
    ]);

    expect(state.nodes.find((n) => n.id === "answer-1")?.usage).toEqual({
      inputTokens: 1840,
      outputTokens: 318,
      costUsd: 0.041,
    });
  });

  it("completes the run without dropping earlier nodes", () => {
    const state = reduceTraceAll([
      run,
      {
        type: "node.started",
        id: "answer-1",
        kind: "answer",
        title: "Answer",
        parentId: "user-run-1",
        ts: 1300,
      },
      { type: "node.completed", id: "answer-1", outputPreview: "Opened issue #41", ts: 1301 },
      { type: "run.completed", runId: "run-1", ts: 1302 },
    ]);

    expect(state.status).toBe("completed");
    expect(state.completedAt).toBe(1302);
    expect(state.nodes).toHaveLength(2);
  });
});

describe("classifyToolName", () => {
  it("classifies Skill as skill", () => {
    expect(classifyToolName("Skill")).toEqual({
      kind: "skill",
      title: "Skill",
    });
  });

  it("classifies mcp__server__tool as mcp with a readable title", () => {
    expect(classifyToolName("mcp__github__create_issue")).toEqual({
      kind: "mcp",
      title: "github / create_issue",
      server: "github",
      tool: "create_issue",
    });
  });

  it("classifies Task as subagent", () => {
    expect(classifyToolName("Task")).toEqual({
      kind: "subagent",
      title: "Task",
    });
  });

  it("classifies builtin tools as tool", () => {
    expect(classifyToolName("Read")).toEqual({
      kind: "tool",
      title: "Read",
    });
  });
});

describe("reasonFor", () => {
  it("explains a skill load in plain language", () => {
    expect(reasonFor({ kind: "skill", title: "frontend-engineer" })).toBe(
      "Loaded frontend-engineer because the task matched that skill",
    );
  });

  it("explains an MCP call with server and tool names", () => {
    expect(
      reasonFor({
        kind: "mcp",
        title: "github / create_issue",
        server: "github",
        tool: "create_issue",
      }),
    ).toBe("Called create_issue on server github");
  });

  it("explains a builtin tool with its first argument", () => {
    expect(
      reasonFor({
        kind: "tool",
        title: "Read",
        inputSummary: "src/Login.tsx",
      }),
    ).toBe("Used Read on src/Login.tsx");
  });
});

describe("redactSecrets", () => {
  it("masks API keys and bearer tokens", () => {
    const redacted = redactSecrets(
      'Authorization: Bearer sk-ant-secret123 and token ghp_abcdefghijklmnop',
    );
    expect(redacted).not.toMatch(/sk-ant-secret123/);
    expect(redacted).not.toMatch(/ghp_abcdefghijklmnop/);
    expect(redacted).toMatch(/\[redacted\]/);
  });
});

describe("githubIssueFixture", () => {
  it("replays into skill, tool, mcp, and answer nodes", () => {
    const state = reduceTraceAll(githubIssueFixture);
    expect(state.status).toBe("completed");
    expect(state.nodes.map((n) => n.kind)).toEqual([
      "user",
      "thinking",
      "skill",
      "tool",
      "mcp",
      "answer",
    ]);
    expect(state.nodes.find((n) => n.kind === "skill")?.reason).toMatch(
      /frontend-engineer/,
    );
    expect(state.nodes.find((n) => n.kind === "mcp")?.title).toBe(
      "github / create_issue",
    );
  });
});
