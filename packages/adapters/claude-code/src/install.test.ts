import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasClaudeCodeHooks, installClaudeCodeHooks } from "./install.js";

describe("installClaudeCodeHooks", () => {
  it("refreshes only projects already attached to the same Studio", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-claude-detect-"));
    expect(hasClaudeCodeHooks(cwd, "http://127.0.0.1:3334")).toBe(false);
    installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=old");
    expect(hasClaudeCodeHooks(cwd, "http://127.0.0.1:3334")).toBe(true);
    expect(hasClaudeCodeHooks(cwd, "http://127.0.0.1:3335")).toBe(false);
  });
  it("writes local Claude Code HTTP hooks for the studio URL", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-claude-"));
    const file = installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=install-test");
    const settings = JSON.parse(readFileSync(file, "utf8")) as {
      hooks: { UserPromptSubmit: { hooks: { url: string }[] }[] };
    };
    expect(file).toContain(".claude");
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].url).toBe(
      "http://127.0.0.1:3334/hook?token=install-test",
    );
  });
  it("replaces stale tokens while preserving unrelated handlers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-claude-rotate-"));
    const file = installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=old");
    const settings = JSON.parse(readFileSync(file, "utf8"));
    settings.hooks.UserPromptSubmit[0].hooks.push({ type: "command", command: "echo keep" });
    writeFileSync(file, JSON.stringify(settings));
    installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=new");
    installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=new");
    const updated = JSON.parse(readFileSync(file, "utf8"));
    const handlers = updated.hooks.UserPromptSubmit.flatMap((group: { hooks: unknown[] }) => group.hooks);
    expect(handlers).toHaveLength(2);
    expect(JSON.stringify(updated)).not.toContain("token=old");
    expect(JSON.stringify(updated)).toContain("echo keep");
    expect(JSON.stringify(updated)).toContain("token=new");
  });
});
