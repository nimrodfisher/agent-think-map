import { describe, expect, it } from "vitest";
import { parseAgentTraceEvent } from "@agent-think-map/protocol";
import { reduceTraceAll } from "@agent-think-map/core";
import { failedReadFixture, failedReadId } from "./failed-read.js";

describe("synthetic failed Read", () => {
  it("uses valid events, unique node identities and existing parents", () => {
    const ids = new Set<string>();
    let previousTs = -1;
    for (const raw of failedReadFixture) {
      const event = parseAgentTraceEvent(raw);
      expect(event).toEqual(raw);
      expect(event.ts).toBeGreaterThanOrEqual(previousTs);
      previousTs = event.ts;
      if (event.type === "run.started") ids.add(`user-${event.runId}`);
      else if (event.type === "node.started") {
        expect(ids.has(event.id)).toBe(false);
        expect(ids.has(event.parentId!)).toBe(true);
        ids.add(event.id);
      } else if ("id" in event) expect(ids.has(event.id)).toBe(true);
    }
    expect(ids.size).toBe(3);
  });

  it("captures one failed Read and a later unverified answer before run completion", () => {
    const state = reduceTraceAll(failedReadFixture);
    const failures = state.nodes.filter(node => node.status === "failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ id: failedReadId, kind: "tool", operation: { name: "read" },
      input: '{"path":"./config/app.json"}', error: "EACCES: permission denied, open './config/app.json'" });
    const answer = state.nodes.find(node => node.kind === "answer")!;
    expect(answer.startedAt).toBeGreaterThan(failures[0].completedAt!);
    expect(answer.title).toBe("Answer (unverified)");
    expect(answer.outputPreview).toContain("remains unverified");
    expect(state.nodes.some(node => node.kind === "thinking")).toBe(false);
    expect(failedReadFixture.at(-1)).toMatchObject({ type: "run.completed" });
    expect(state.completedAt).toBe(400);
    // A run-completed event does not erase the reducer's recorded failure.
    expect(state.status).toBe("failed");
  });
});
