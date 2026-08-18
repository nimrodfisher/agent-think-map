import { afterEach, describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { cleanup, render, screen } from "@testing-library/react";
import { RunClock } from "./RunClock.js";
import { createTraceStore, TraceStoreProvider } from "./store.js";

afterEach(() => cleanup());

describe("RunClock", () => {
  it("renders occurrence times above the run and the total when it has ended", () => {
    const store = createTraceStore(reduceTraceAll(githubIssueFixture));

    render(
      <TraceStoreProvider value={store}>
        <RunClock />
      </TraceStoreProvider>,
    );

    expect(screen.getByRole("list", { name: "Run clock" })).toBeTruthy();
    expect(screen.getByText("+120ms")).toBeTruthy();
    expect(screen.getByText("+500ms")).toBeTruthy();
    expect(screen.getByText("1s total")).toBeTruthy();
  });

  it("omits the total while the run is still going", () => {
    const store = createTraceStore(reduceTraceAll(githubIssueFixture.slice(0, 4)));

    render(
      <TraceStoreProvider value={store}>
        <RunClock />
      </TraceStoreProvider>,
    );

    expect(screen.queryByText(/total/i)).toBeNull();
  });
});
