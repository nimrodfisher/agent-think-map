import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideCodexConsent, resetCodexConsent } from "./consent.js";

function hook(input: Record<string, unknown>): string {
  return JSON.stringify({ session_id: "session-1", ...input });
}

describe("Codex consent", () => {
  it("blocks the first prompt and asks for explicit consent without forwarding it", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-consent-"));
    const decision = decideCodexConsent(
      hook({ hook_event_name: "UserPromptSubmit", prompt: "Fix the bug" }),
      home,
    );

    expect(decision.forward).toEqual([]);
    expect(decision.output).toMatchObject({ decision: "block" });
    expect(decision.output?.reason).toContain("Reply yes");
  });

  it("enables future sessions and replays the consented original prompt", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-consent-"));
    const original = hook({ hook_event_name: "UserPromptSubmit", prompt: "Fix the bug" });
    decideCodexConsent(original, home);

    const decision = decideCodexConsent(
      hook({ hook_event_name: "UserPromptSubmit", prompt: "yes" }),
      home,
    );

    expect(decision.forward).toEqual([original]);
    expect(decision.sessionConsent).toBe("enabled");
    expect(decision.output).toMatchObject({
      systemMessage: expect.stringContaining("enabled"),
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: expect.stringContaining("Fix the bug"),
      },
    });

    const tool = decideCodexConsent(
      hook({ hook_event_name: "PreToolUse", tool_name: "Bash" }),
      home,
    );
    expect(tool.forward).toEqual([hook({ hook_event_name: "PreToolUse", tool_name: "Bash" })]);
  });

  it("persists no and does not ask again", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-consent-"));
    decideCodexConsent(
      hook({ hook_event_name: "UserPromptSubmit", prompt: "Inspect the repo" }),
      home,
    );
    decideCodexConsent(hook({ hook_event_name: "UserPromptSubmit", prompt: "no thanks" }), home);

    const next = decideCodexConsent(
      hook({ hook_event_name: "SessionStart", source: "startup" }),
      home,
    );
    expect(next.sessionConsent).toBe("disabled");
    expect(next.forward).toEqual([]);
  });

  it("treats later as a per-session deferral", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-consent-"));
    decideCodexConsent(
      hook({ hook_event_name: "UserPromptSubmit", prompt: "Inspect the repo" }),
      home,
    );
    decideCodexConsent(hook({ hook_event_name: "UserPromptSubmit", prompt: "later" }), home);

    const sameSession = decideCodexConsent(
      hook({ hook_event_name: "PreToolUse", tool_name: "Bash" }),
      home,
    );
    expect(sameSession.sessionConsent).toBe("skipped");
    expect(sameSession.forward).toEqual([]);

    const newSession = decideCodexConsent(
      hook({ session_id: "session-2", hook_event_name: "SessionStart", source: "startup" }),
      home,
    );
    expect(newSession.sessionConsent).toBe("pending");
  });

  it("resets consent when the user reinstalls", () => {
    const home = mkdtempSync(join(tmpdir(), "atm-consent-"));
    decideCodexConsent(hook({ hook_event_name: "SessionStart" }), home);
    resetCodexConsent(home);
    expect(JSON.parse(readFileSync(join(home, ".agent-think-map", "codex-consent.json"), "utf8"))).toEqual({
      consent: "pending",
      sessions: {},
    });
  });
});
