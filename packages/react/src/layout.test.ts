import { describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { layoutTraceGraph } from "./layout.js";

describe("layoutTraceGraph", () => {
  it("places later nodes further to the right", async () => {
    const state = reduceTraceAll(githubIssueFixture);
    const graph = await layoutTraceGraph(state.nodes, state.edges);
    const user = graph.nodes.find((node) => node.id.startsWith("user-"));
    const answer = graph.nodes.find((node) => node.id === "answer-1");
    expect(user).toBeTruthy();
    expect(answer).toBeTruthy();
    expect((answer?.position.x ?? 0) > (user?.position.x ?? 0)).toBe(true);
  });
});
