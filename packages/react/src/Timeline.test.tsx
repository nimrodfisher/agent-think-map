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
  });
});
