import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { TraceStoreProvider, createTraceStore } from "./store.js";
import { TraceCanvas } from "./TraceCanvas.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

describe("TraceCanvas hover", () => {
  it("records hoveredNodeId when a node is entered and clears on leave", async () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore(state);
    render(
      <TraceStoreProvider value={store}>
        <div style={{ width: 800, height: 600 }}>
          <TraceCanvas />
        </div>
      </TraceStoreProvider>,
    );
    const skill = state.nodes.find((node) => node.kind === "skill");
    expect(skill).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector(`.atc-node--skill`)).toBeTruthy();
    });
    const article = document.querySelector(`.atc-node--skill`);
    expect(article).toBeTruthy();
    fireEvent.mouseEnter(article!);
    expect(store.getState().hoveredNodeId).toBe(skill!.id);
    await waitFor(() => {
      expect(document.querySelector(".atc-node--skill")?.className).toContain("is-hovered");
    });
    fireEvent.mouseLeave(article!);
    expect(store.getState().hoveredNodeId).toBeUndefined();
  });
});
