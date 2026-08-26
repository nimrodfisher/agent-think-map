import { afterEach, describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Timeline } from "./Timeline.js";
import { ALL_KIND_FILTER } from "./layout.js";
import { createTraceStore, TraceStoreProvider } from "./store.js";

afterEach(() => cleanup());

describe("Timeline", () => {
  it("shows kind emojis, step durations, waits, and usage", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore(state);

    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );

    expect(screen.getByRole("list")).toBeTruthy();
    expect(screen.getByText("💭")).toBeTruthy();
    expect(screen.getByText("📘")).toBeTruthy();
    expect(screen.getByText("200ms")).toBeTruthy();
    expect(screen.getByText("18ms")).toBeTruthy();
    expect(screen.getByText("+20ms")).toBeTruthy();
    expect(screen.getByText("+120ms")).toBeTruthy();
    expect(screen.getByText("86 tok · 0.1¢")).toBeTruthy();
    expect(screen.getByText("1.3k tok · 0.8¢")).toBeTruthy();
    expect(screen.getByRole("button", { name: /frontend-engineer/ }).className).toContain(
      "atc-span--skill",
    );
  });

  it("shows run total time and tokens on the tape", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore(state);

    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );

    const totals = screen.getByLabelText("Run totals");
    expect(totals.textContent).toContain("1s total");
    expect(totals.textContent).toMatch(/tok/);
    expect(screen.getByRole("list").lastElementChild).toBe(totals);
  });

  it("hovering a timeline span sets hoveredNodeId", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore(state);
    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );
    const skill = state.nodes.find((n) => n.kind === "skill");
    fireEvent.mouseEnter(screen.getByRole("button", { name: new RegExp(skill!.title) }));
    expect(store.getState().hoveredNodeId).toBe(skill!.id);
  });

  it("leaving a timeline span clears hover without changing selection", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const selected = state.nodes.find((node) => node.kind === "thinking");
    const skill = state.nodes.find((node) => node.kind === "skill");
    const store = createTraceStore({ ...state, selectedNodeId: selected?.id });
    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );
    const span = screen.getByRole("button", { name: new RegExp(skill!.title) });
    fireEvent.mouseEnter(span);
    expect(store.getState().hoveredNodeId).toBe(skill!.id);
    fireEvent.mouseLeave(span);
    expect(store.getState().hoveredNodeId).toBeUndefined();
    expect(store.getState().selectedNodeId).toBe(selected!.id);
  });

  it("applies is-hovered from hoveredNodeId so canvas hover marks the span", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const skill = state.nodes.find((node) => node.kind === "skill");
    const store = createTraceStore(state);
    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );
    act(() => {
      store.getState().hover(skill!.id);
    });
    expect(screen.getByRole("button", { name: new RegExp(skill!.title) }).className).toContain(
      "is-hovered",
    );
  });

  it("dims filterable spans and never marks always-visible kinds as filtered-out", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const skill = state.nodes.find((node) => node.kind === "skill");
    const thinking = state.nodes.find((node) => node.kind === "thinking");
    const user = state.nodes.find((node) => node.kind === "user");
    const answer = state.nodes.find((node) => node.kind === "answer" || node.kind === "result");
    const store = createTraceStore(state);
    store.getState().setKindFilter({ ...ALL_KIND_FILTER, skill: false, tool: false });
    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );
    expect(screen.getByRole("button", { name: new RegExp(skill!.title) }).className).toContain(
      "is-filtered-out",
    );
    expect(screen.getByRole("button", { name: new RegExp(thinking!.title) }).className).not.toContain(
      "is-filtered-out",
    );
    if (user) {
      expect(screen.getByRole("button", { name: new RegExp(user.title) }).className).not.toContain(
        "is-filtered-out",
      );
    }
    if (answer) {
      expect(screen.getByRole("button", { name: new RegExp(answer.title) }).className).not.toContain(
        "is-filtered-out",
      );
    }
  });

  it("marks the selected span with aria-current step", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const skill = state.nodes.find((node) => node.kind === "skill");
    const store = createTraceStore({ ...state, selectedNodeId: skill?.id });
    render(
      <TraceStoreProvider value={store}>
        <Timeline />
      </TraceStoreProvider>,
    );
    expect(screen.getByRole("button", { name: new RegExp(skill!.title) }).getAttribute("aria-current")).toBe(
      "step",
    );
  });
});
