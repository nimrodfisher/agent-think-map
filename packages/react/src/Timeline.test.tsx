import { describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { render, screen } from "@testing-library/react";
import { Timeline } from "./Timeline.js";
import { createTraceStore, TraceStoreProvider } from "./store.js";

describe("Timeline", () => {
  it("shows kind emojis, step durations, and waits between steps", () => {
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
  });
});
