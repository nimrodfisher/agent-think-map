import { describe, expect, it } from "vitest";
import { filterSessions, pickStudioSession, sessionEfforts, sessionModels } from "./sessions.js";
import type { SessionSummary } from "./hub.js";

const sessions: SessionSummary[] = [
  {
    id: "a",
    prompt: "Find churn drivers",
    live: true,
    updatedAt: 1,
    eventCount: 4,
    model: "gpt-5.4",
    effort: "high",
  },
  {
    id: "b",
    prompt: "Open a GitHub issue",
    live: false,
    updatedAt: 2,
    eventCount: 8,
    model: "gpt-5.4-mini",
    effort: "low",
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
      filterSessions(sessions, { query: "", status: "live", model: "gpt-5.4" }).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
  });

  it("lists distinct model and effort values for filter chips", () => {
    expect(sessionModels(sessions)).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(sessionEfforts(sessions)).toEqual(["high", "low"]);
  });
});

describe("pickStudioSession", () => {
  const smoke: SessionSummary = {
    id: "smoke",
    prompt: "Read README.md and summarize it",
    live: true,
    updatedAt: 1,
    eventCount: 8,
  };
  const live: SessionSummary = {
    id: "thr_real",
    prompt: "Fix the login form",
    live: true,
    updatedAt: 2,
    eventCount: 4,
  };

  it("ignores a smoke URL when a live Codex session exists", () => {
    expect(
      pickStudioSession([smoke, live], { selected: "smoke", userPicked: false }),
    ).toBe("thr_real");
  });

  it("keeps smoke only when the user clicked it", () => {
    expect(
      pickStudioSession([smoke, live], { selected: "smoke", userPicked: true }),
    ).toBe("smoke");
  });

  it("follows the newest live real session", () => {
    const later: SessionSummary = { ...live, id: "thr_later", updatedAt: 3 };
    expect(pickStudioSession([smoke, live, later], { selected: "thr_real" })).toBe("thr_later");
  });
});
