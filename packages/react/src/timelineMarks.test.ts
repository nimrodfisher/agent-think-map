import { describe, expect, it } from "vitest";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { formatDuration, timelineMarks } from "./timelineMarks.js";

describe("formatDuration", () => {
  it("renders milliseconds under one second", () => {
    expect(formatDuration(18)).toBe("18ms");
    expect(formatDuration(200)).toBe("200ms");
  });

  it("renders seconds at or above 1000ms", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(1200)).toBe("1.2s");
  });
});

describe("timelineMarks", () => {
  it("labels each step duration and the wait until the next step", () => {
    const { nodes } = reduceTraceAll(githubIssueFixture);
    const marks = timelineMarks(nodes);

    expect(marks.filter((mark) => mark.type === "span").map((mark) => mark.durationLabel)).toEqual([
      "0ms",
      "200ms",
      "18ms",
      "24ms",
      "310ms",
      "80ms",
    ]);

    expect(marks.filter((mark) => mark.type === "gap").map((mark) => mark.label)).toEqual([
      "+120ms",
      "+20ms",
      "+42ms",
      "+56ms",
      "+30ms",
    ]);
  });

  it("shows an ellipsis for a still-running step", () => {
    const marks = timelineMarks([
      {
        id: "think-1",
        kind: "thinking",
        title: "Thinking",
        text: "",
        status: "running",
        startedAt: 10,
      },
    ]);

    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ type: "span", durationLabel: "…" });
  });

  it("omits a gap when the next step starts before the previous one finishes", () => {
    const marks = timelineMarks([
      {
        id: "a",
        kind: "thinking",
        title: "Thinking",
        text: "",
        status: "completed",
        startedAt: 0,
        completedAt: 100,
        durationMs: 100,
      },
      {
        id: "b",
        kind: "skill",
        title: "Skill",
        text: "",
        status: "completed",
        startedAt: 40,
        completedAt: 50,
        durationMs: 10,
      },
    ]);

    expect(marks.map((mark) => mark.type)).toEqual(["span", "span"]);
  });
});
