import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installClaudeCodeHooks } from "./install.js";

describe("installClaudeCodeHooks", () => {
  it("writes local Claude Code HTTP hooks for the studio URL", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-claude-"));
    const file = installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook");
    const settings = JSON.parse(readFileSync(file, "utf8")) as {
      hooks: { UserPromptSubmit: { hooks: { url: string }[] }[] };
    };
    expect(file).toContain(".claude");
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].url).toBe(
      "http://127.0.0.1:3334/hook",
    );
  });
});
