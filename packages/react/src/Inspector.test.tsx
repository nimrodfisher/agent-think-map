import { afterEach, describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByText("18 total · 18 out")).toBeTruthy();
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

    expect(screen.getByText("2,158 total · 1,840 in / 318 out")).toBeTruthy();
    expect(screen.getByText("$0.041")).toBeTruthy();
  });

  it("shows session model and effort when nothing is selected", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore({
      ...state,
      selectedNodeId: undefined,
      model: "claude-sonnet-5",
      effort: "high",
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByText("claude-sonnet-5")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("120 total · 100 in / 20 out")).toBeTruthy();
  });

  it("prettifies SQL inside a selected MCP tool input", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const mcp = state.nodes.find((node) => node.kind === "mcp");
    const store = createTraceStore({
      ...state,
      selectedNodeId: mcp?.id,
      nodes: state.nodes.map((node) =>
        node.id === mcp?.id
          ? {
              ...node,
              input:
                '{"project_id":"gmtrkkyfxmqfmoznzpgp","query":"SELECT status FROM subscriptions GROUP BY status;"}',
            }
          : node,
      ),
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByText(/FROM subscriptions/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Raw JSON" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByRole("button", { name: "Prettify SQL" })).toBeTruthy();
  });

  it("pretty-prints JSON tool input from the inspector", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const tool = state.nodes.find((node) => node.kind === "tool");
    const store = createTraceStore({
      ...state,
      selectedNodeId: tool?.id,
      nodes: state.nodes.map((node) =>
        node.id === tool?.id ? { ...node, input: '{"file_path":"README.md","limit":20}' } : node,
      ),
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByText(/"file_path": "README.md"/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Raw JSON" })).toBeTruthy();
  });

  it("pretty-prints JSON tool output from the inspector", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const tool = state.nodes.find((node) => node.kind === "tool");
    const store = createTraceStore({
      ...state,
      selectedNodeId: tool?.id,
      nodes: state.nodes.map((node) =>
        node.id === tool?.id
          ? { ...node, outputPreview: '{"rows":[{"id":1,"name":"alpha"}]}' }
          : node,
      ),
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    expect(screen.getByText(/"name": "alpha"/)).toBeTruthy();
  });

  it("puts pretty actions on the left of the inspector field label", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const tool = state.nodes.find((node) => node.kind === "tool");
    const store = createTraceStore({
      ...state,
      selectedNodeId: tool?.id,
      nodes: state.nodes.map((node) =>
        node.id === tool?.id ? { ...node, input: '{"file_path":"README.md"}' } : node,
      ),
    });

    render(
      <TraceStoreProvider value={store}>
        <Inspector />
      </TraceStoreProvider>,
    );

    const dt = screen.getByText("Input").closest("dt");
    expect(dt?.innerHTML.indexOf("atc-pretty-actions")).toBeLessThan(dt?.innerHTML.indexOf("Input") ?? -1);
  });
});
