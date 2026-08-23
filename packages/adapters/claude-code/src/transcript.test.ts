import { describe, expect, it } from "vitest";
import {
  modelFromTranscriptText,
  usageFromTranscriptText,
  resolveTranscriptPath,
} from "./transcript.js";

describe("usageFromTranscriptText", () => {
  it("sums assistant message usage across the transcript", () => {
    const text = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "find churn" },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 40,
            cache_creation_input_tokens: 10,
          },
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          usage: { input_tokens: 2, output_tokens: 80, cache_read_input_tokens: 400 },
        },
      }),
    ].join("\n");

    expect(usageFromTranscriptText(text)).toEqual({
      inputTokens: 102,
      outputTokens: 100,
      cacheReadTokens: 440,
      cacheCreationTokens: 10,
    });
  });

  it("returns undefined when the transcript has no usage", () => {
    expect(usageFromTranscriptText('{"type":"user"}\n')).toBeUndefined();
  });
});

describe("modelFromTranscriptText", () => {
  it("reads the last main-thread assistant model", () => {
    const text = [
      JSON.stringify({ type: "user", message: { role: "user" } }),
      JSON.stringify({
        type: "assistant",
        isSidechain: false,
        message: { model: "claude-sonnet-5" },
      }),
      JSON.stringify({
        type: "assistant",
        isSidechain: true,
        message: { model: "claude-haiku-4" },
      }),
    ].join("\n");

    expect(modelFromTranscriptText(text)).toBe("claude-sonnet-5");
  });

  it("returns undefined when no assistant model is present", () => {
    expect(modelFromTranscriptText('{"type":"user"}\n')).toBeUndefined();
  });
});

describe("resolveTranscriptPath", () => {
  it("expands a home-relative Claude Code transcript path", () => {
    const resolved = resolveTranscriptPath("~/.claude/projects/sess.jsonl");
    expect(
      resolved.endsWith(".claude\\projects\\sess.jsonl") ||
        resolved.endsWith(".claude/projects/sess.jsonl"),
    ).toBe(true);
    expect(resolved.includes("~")).toBe(false);
  });
});
