import { describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { render, screen } from "@testing-library/react";
import { Inspector } from "./Inspector.js";
import { createTraceStore, TraceStoreProvider } from "./store.js";

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
});
