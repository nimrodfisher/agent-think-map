import { describe, expect, it } from "vitest";
import { kindMeta } from "./kinds.js";

describe("kindMeta", () => {
  it("maps each node kind to an emoji and label", () => {
    expect(kindMeta("user")).toEqual({ emoji: "💬", label: "Prompt", short: "Prompt" });
    expect(kindMeta("thinking")).toEqual({ emoji: "💭", label: "Thinking", short: "Think" });
    expect(kindMeta("skill")).toEqual({ emoji: "📘", label: "Skill", short: "Skill" });
    expect(kindMeta("tool")).toEqual({ emoji: "🔧", label: "Tool", short: "Tool" });
    expect(kindMeta("mcp")).toEqual({ emoji: "🔌", label: "MCP", short: "MCP" });
    expect(kindMeta("subagent")).toEqual({ emoji: "🧩", label: "Task", short: "Task" });
    expect(kindMeta("result")).toEqual({ emoji: "📤", label: "Result", short: "Out" });
    expect(kindMeta("answer")).toEqual({ emoji: "✅", label: "Answer", short: "Answer" });
  });
});
