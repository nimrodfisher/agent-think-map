import { describe, expect, it } from "vitest";
import { agentTraceEventSchema, parseAgentTraceEvent } from "./index.js";

describe("agentTraceEventSchema", () => {
  it("accepts a run.started event", () => {
    const event = {
      type: "run.started",
      runId: "run-1",
      prompt: "Open a GitHub issue for the login bug",
      ts: 1,
    };

    expect(agentTraceEventSchema.parse(event)).toEqual(event);
  });

  it("accepts a node.started event with optional parent and reason", () => {
    const event = {
      type: "node.started",
      id: "skill-1",
      kind: "skill",
      title: "frontend-engineer",
      parentId: "think-1",
      reason: "Loaded frontend-engineer because the task matched that skill",
      ts: 2,
    };

    expect(agentTraceEventSchema.parse(event)).toEqual(event);
  });

  it("rejects an unknown event type", () => {
    const result = agentTraceEventSchema.safeParse({
      type: "run.paused",
      ts: 1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a node.started event with an invalid kind", () => {
    const result = agentTraceEventSchema.safeParse({
      type: "node.started",
      id: "x",
      kind: "memory",
      title: "oops",
      ts: 1,
    });

    expect(result.success).toBe(false);
  });
});

describe("parseAgentTraceEvent", () => {
  it("returns the event when JSON is valid", () => {
    const event = parseAgentTraceEvent({
      type: "node.delta",
      id: "think-1",
      text: "checking the login form",
      ts: 3,
    });

    expect(event.type).toBe("node.delta");
    if (event.type === "node.delta") {
      expect(event.text).toBe("checking the login form");
    }
  });

  it("throws a named error when JSON is not a trace event", () => {
    expect(() => parseAgentTraceEvent({ hello: "world" })).toThrowError(
      /Invalid AgentTraceEvent/,
    );
  });
});
