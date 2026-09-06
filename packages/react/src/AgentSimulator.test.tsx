import { afterEach, describe, expect, it, vi } from "vitest";
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
  it('selects a requested node after its replayed events arrive',() => {
    const onNodeSelect = vi.fn();
    render(<AgentSimulator events={[
      {type:'run.started',runId:'run',prompt:'Task',ts:1},
      {type:'node.started',id:'target',kind:'tool',title:'Target tool',ts:2},
      {type:'node.started',id:'other',kind:'tool',title:'Other tool',ts:3},
    ]} replay={false} selectedNodeId="target" onNodeSelect={onNodeSelect} />);
    expect(onNodeSelect.mock.calls.at(-1)?.[0]?.id).toBe('target');
  });
  it("omits the upper run clock and keeps totals on the timeline", () => {
    render(<AgentSimulator events={githubIssueFixture} replay={false} layout="split" />);

    expect(screen.queryByRole("list", { name: "Run clock" })).toBeNull();
    expect(screen.getByLabelText("Run totals").textContent).toContain("1s total");
  });
});
