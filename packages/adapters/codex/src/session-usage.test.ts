import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexSessionUsage } from "./session-usage.js";
import { codexSessionMetadata } from "./session-metadata.js";

describe("codexSessionUsage", () => {
  it("reads the latest cumulative token count without reading transcript content", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-codex-usage-"));
    const directory = join(home, ".codex", "sessions", "2026", "08", "30");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "rollout-test-session.jsonl"),
      `${JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 1200, cached_input_tokens: 800, cache_write_input_tokens: 30, output_tokens: 240, cost_usd: 0.0123 } } } })}\n`,
    );
    expect(codexSessionUsage("test-session", home)).toEqual({
      inputTokens: 1200,
      outputTokens: 240,
      cacheReadTokens: 800,
      cacheCreationTokens: 30,
      costUsd: 0.0123,
    });
  });
});

describe("codexSessionMetadata", () => {
  it("reads model and reasoning effort from Codex turn context records", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-codex-metadata-"));
    const directory = join(home, ".codex", "sessions", "2026", "08", "30");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "rollout-test-session.jsonl"),
      `${JSON.stringify({ type: "turn_context", model: "gpt-5.6-luna", effort: "high" })}\n`,
    );
    expect(codexSessionMetadata("test-session", home)).toEqual({
      model: "gpt-5.6-luna",
      effort: "high",
    });
  });
});
