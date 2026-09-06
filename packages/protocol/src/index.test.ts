import { parseTraceEnvelope } from "./index.js";
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

  it("accepts optional usage on node.completed and run.completed", () => {
    const completed = {
      type: "node.completed" as const,
      id: "answer-1",
      outputPreview: "Opened issue #41",
      usage: {
        inputTokens: 1204,
        outputTokens: 318,
        cacheReadTokens: 400,
        costUsd: 0.041,
      },
      ts: 4,
    };
    const runDone = {
      type: "run.completed" as const,
      runId: "run-1",
      usage: { inputTokens: 1204, outputTokens: 318, costUsd: 0.041 },
      ts: 5,
    };

    expect(agentTraceEventSchema.parse(completed)).toEqual(completed);
    expect(agentTraceEventSchema.parse(runDone)).toEqual(runDone);
  });

  it("accepts run.meta with model, effort, and usage", () => {
    const event = {
      type: "run.meta" as const,
      runId: "run-1",
      model: "claude-sonnet-5",
      effort: "high",
      usage: { inputTokens: 1840, outputTokens: 318 },
      ts: 6,
    };
    expect(agentTraceEventSchema.parse(event)).toEqual(event);
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


describe('versioned envelopes', () => {
  it('wraps legacy events without collapsing identical repeats', () => {
    const raw = { type: 'node.delta', id: 'n', text: 'same', ts: 1, future: { nested: true } };
    const context = { provider: 'custom' as const, sessionId: 's' };
    const a = parseTraceEnvelope(raw, context), b = parseTraceEnvelope(raw, context);
    expect(a.eventId).not.toBe(b.eventId);
    expect(a.eventIdProvenance).toBe('generated-unique');
    expect(a.payload).toEqual(raw);
    expect(parseTraceEnvelope(raw, {...context, stableId:'delivery'}).eventId).toBe(parseTraceEnvelope(raw, {...context, stableId:'delivery'}).eventId);
  });
  it('validates V1 and preserves top-level and nested extensions through JSON', () => {
    const raw = { schemaVersion:1,eventId:'e',sequence:7,provider:'codex',sessionId:'s',timestamp:1,
      extra:{next:true},payload:{type:'run.meta',runId:'s',ts:1,usage:{inputTokens:2,future:3},future:'yes'} };
    const context = { provider:'custom' as const,sessionId:'ignored' };
    expect(JSON.parse(JSON.stringify(parseTraceEnvelope(raw,context)))).toEqual(raw);
    expect(()=>parseTraceEnvelope({...raw,schemaVersion:2},context)).toThrow();
    expect(()=>parseTraceEnvelope({...raw,sequence:-1},context)).toThrow();
    expect(()=>parseTraceEnvelope({...raw,payload:{type:'invalid'}},context)).toThrow();
  });
});
it('captures optional operation and remains compatible with old producer events',()=>{
 const old={type:'node.started',id:'n',kind:'tool',title:'Short display',ts:1};
 expect(parseAgentTraceEvent(old)).not.toHaveProperty('operation');
 expect(parseAgentTraceEvent({...old,operation:{name:'github.create_issue',server:'github',providerName:'raw'}})).toHaveProperty('operation.name','github.create_issue');
});
