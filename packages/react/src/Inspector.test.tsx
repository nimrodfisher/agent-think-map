import { afterEach, describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { cleanup, render, screen } from "@testing-library/react";
import { Inspector } from "./Inspector.js";
import { createTraceStore, TraceStoreProvider } from "./store.js";

afterEach(() => cleanup());

describe("Inspector", () => {
  it("shows why a selected skill ran", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const skill = state.nodes.find((node) => node.kind === "skill");
    const store = createTraceStore({ ...state, selectedNodeId: skill?.id });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByRole("heading", { name: "frontend-engineer" })).toBeTruthy();
    expect(
      screen.getByText("Loaded frontend-engineer because the task matched that skill"),
    ).toBeTruthy();
  });

  it("shows token and cost rows when the selected node has usage", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const skill = state.nodes.find((node) => node.kind === "skill");
    const store = createTraceStore({
      ...state,
      selectedNodeId: skill?.id,
      nodes: state.nodes.map((node) =>
        node.id === skill?.id
          ? { ...node, usage: { outputTokens: 18, costUsd: 0.0004 } }
          : node,
      ),
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByText("18 out")).toBeTruthy();
    expect(screen.getByText("$0.0004")).toBeTruthy();
  });

  it("shows run totals when nothing is selected", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore({
      ...state,
      selectedNodeId: undefined,
      usage: { inputTokens: 1840, outputTokens: 318, costUsd: 0.041 },
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByText("1,840 in / 318 out")).toBeTruthy();
    expect(screen.getByText("$0.041")).toBeTruthy();
  });
});
