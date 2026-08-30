import { describe, expect, it } from "vitest";
import { CodexTraceHub, codexHookSettings, hookForwardCommand, mergeCodexHookSettings } from "./hub.js";

describe("CodexTraceHub", () => {
  it("isolates sessions and lists the Codex model", () => {
    const hub = new CodexTraceHub({ now: () => 11 });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
      model: "gpt-5.4",
    });
    hub.ingest({
      session_id: "b",
      hook_event_name: "UserPromptSubmit",
      prompt: "Open issue",
    });
    expect(hub.list()).toEqual([
      expect.objectContaining({ id: "a", prompt: "Fix overflow", model: "gpt-5.4", live: true }),
      expect.objectContaining({ id: "b", prompt: "Open issue", live: true }),
    ]);
  });
});

describe("codexHookSettings", () => {
  const cliJs = "/tmp/agent-think-map/bin/cli.mjs";

  it("emits command hooks, not HTTP hooks", () => {
    const settings = codexHookSettings(
      hookForwardCommand("http://127.0.0.1:3335/hook", cliJs, "node"),
    );
    expect(settings.hooks.UserPromptSubmit[0].hooks[0]).toMatchObject({
      type: "command",
      timeout: 5,
    });
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain("cli.mjs");
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).not.toContain("npx ");
    expect(JSON.stringify(settings)).not.toMatch(/"type":"http"/);
    expect(settings.hooks.SessionEnd[0].hooks[0].timeout).toBe(3);
  });

  it("replaces an older npx hook-forward without dropping unrelated groups", () => {
    const command = hookForwardCommand("http://127.0.0.1:3335/hook", cliJs, "node");
    const merged = mergeCodexHookSettings(
      {
        hooks: {
          Stop: [
            { hooks: [{ type: "command", command: "echo keep-me", timeout: 5 }] },
            {
              hooks: [
                {
                  type: "command",
                  command: "npx agent-think-map hook-forward --url http://127.0.0.1:3335/hook",
                  timeout: 5,
                },
              ],
            },
          ],
        },
      },
      command,
    );
    expect(merged.hooks.Stop.some((group) => group.hooks[0]?.command === "echo keep-me")).toBe(
      true,
    );
    expect(JSON.stringify(merged.hooks.Stop)).not.toContain("npx agent-think-map");
    expect(merged.hooks.UserPromptSubmit[0].hooks[0].command).toBe(command);
  });
});
