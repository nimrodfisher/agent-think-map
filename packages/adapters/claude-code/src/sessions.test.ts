import { describe, expect, it } from "vitest";
import { filterSessions, sessionEfforts, sessionModels } from "./sessions.js";
import type { SessionSummary } from "./hub.js";

const sessions: SessionSummary[] = [
  {
    id: "a",
    prompt: "Find churn drivers",
    live: true,
    updatedAt: 1,
    eventCount: 4,
    model: "claude-sonnet-5",
    effort: "high",
  },
  {
    id: "b",
    prompt: "Open a GitHub issue",
    live: false,
    updatedAt: 2,
    eventCount: 8,
    model: "claude-opus-4",
    effort: "low",
  },
  {
    id: "c",
    prompt: "List tables",
    live: true,
    updatedAt: 3,
    eventCount: 2,
  },
];

describe("filterSessions", () => {
  it("filters by prompt text, live/ended, model, and effort", () => {
    expect(
      filterSessions(sessions, { query: "churn", status: "all" }).map((s) => s.id),
    ).toEqual(["a"]);
    expect(
      filterSessions(sessions, { query: "", status: "ended" }).map((s) => s.id),
    ).toEqual(["b"]);
    expect(
      filterSessions(sessions, { query: "", status: "live", model: "claude-sonnet-5" }).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterSessions(sessions, { query: "", status: "all", effort: "low" }).map((s) => s.id),
    ).toEqual(["b"]);
  });

  it("lists distinct model and effort values for filter chips", () => {
    expect(sessionModels(sessions)).toEqual(["claude-opus-4", "claude-sonnet-5"]);
    expect(sessionEfforts(sessions)).toEqual(["high", "low"]);
  });
});
