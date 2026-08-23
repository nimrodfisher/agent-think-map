import { describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { filterTraceGraph, layoutTraceGraph } from "./layout.js";

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

  it("places sibling tools in the same column as a branch, not a chain", async () => {
    const graph = await layoutTraceGraph(
      [
        {
          id: "user-1",
          kind: "user",
          title: "User",
          text: "go",
          status: "completed",
          startedAt: 0,
        },
        {
          id: "tool-a",
          kind: "tool",
          title: "Bash",
          parentId: "user-1",
          text: "",
          status: "completed",
          startedAt: 1,
        },
        {
          id: "tool-b",
          kind: "tool",
          title: "Bash",
          parentId: "user-1",
          text: "",
          status: "completed",
          startedAt: 2,
        },
      ],
      [
        { id: "user-1->tool-a", source: "user-1", target: "tool-a" },
        { id: "user-1->tool-b", source: "user-1", target: "tool-b" },
      ],
    );
    const a = graph.nodes.find((node) => node.id === "tool-a");
    const b = graph.nodes.find((node) => node.id === "tool-b");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(Math.abs((a?.position.x ?? 0) - (b?.position.x ?? 0))).toBeLessThan(20);
    expect(Math.abs((a?.position.y ?? 0) - (b?.position.y ?? 0))).toBeGreaterThan(40);
  });
});

describe("filterTraceGraph", () => {
  it("hides tools and their edges when Tools is off", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const filtered = filterTraceGraph(state.nodes, state.edges, {
      tool: false,
      skill: true,
      mcp: true,
      subagent: true,
    });
    expect(filtered.nodes.some((node) => node.kind === "tool")).toBe(false);
    expect(filtered.nodes.some((node) => node.kind === "user")).toBe(true);
    expect(filtered.edges.some((edge) => edge.target === "tool-read" || edge.source === "tool-read")).toBe(
      false,
    );
  });
});
