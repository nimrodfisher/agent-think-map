import { afterEach, describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { cleanup, render, screen } from "@testing-library/react";
import { Timeline } from "./Timeline.js";
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
});
