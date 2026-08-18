import { describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { runClock } from "./clockAxis.js";

describe("runClock", () => {
  it("places each node at its offset from run start", () => {
    const state = reduceTraceAll(githubIssueFixture);
    const clock = runClock(state);

    expect(clock.ticks.map((tick) => [tick.title, tick.offsetLabel])).toEqual([
      ["User", "0ms"],
      ["Thinking", "+120ms"],
      ["frontend-engineer", "+340ms"],
      ["Read", "+400ms"],
      ["github / create_issue", "+500ms"],
      ["Answer", "+880ms"],
    ]);
  });

  it("shows total elapsed only after the run ends", () => {
    const running = reduceTraceAll(githubIssueFixture.slice(0, 4));
    expect(runClock(running).totalLabel).toBeUndefined();
    expect(runClock(running).done).toBe(false);

    const done = reduceTraceAll(githubIssueFixture);
    expect(done.status).toBe("completed");
    expect(runClock(done).done).toBe(true);
    expect(runClock(done).totalLabel).toBe("1s total");
    expect(runClock(done).elapsedMs).toBe(1000);
  });
});
