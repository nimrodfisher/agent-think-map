import { afterEach, describe, expect, it } from "vitest";
import { githubIssueFixture } from "@agent-think-map/core";
import { cleanup, render, screen } from "@testing-library/react";
import { AgentSimulator } from "./AgentSimulator.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

describe("AgentSimulator", () => {
  it("omits the upper run clock and keeps totals on the timeline", () => {
    render(<AgentSimulator events={githubIssueFixture} replay={false} layout="split" />);

    expect(screen.queryByRole("list", { name: "Run clock" })).toBeNull();
    expect(screen.getByLabelText("Run totals").textContent).toContain("1s total");
  });
});
