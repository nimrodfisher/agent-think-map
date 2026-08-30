import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexProjectRoot, installCodexHooks } from "./install.js";

describe("codexProjectRoot", () => {
  it("resolves a subdirectory to the Git worktree root", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-root-"));
    const nested = join(cwd, "src", "nested");
    mkdirSync(nested, { recursive: true });
    execFileSync("git", ["init", "--quiet", cwd]);
    expect(codexProjectRoot(nested)).toBe(cwd);
  });

  it("keeps non-repository directories unchanged", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-cwd-"));
    expect(codexProjectRoot(cwd)).toBe(cwd);
  });
});

describe("installCodexHooks", () => {
  it("writes .codex/hooks.json command hooks for the studio URL", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-"));
    const file = installCodexHooks(cwd, "http://127.0.0.1:3335/hook", join(cwd, "cli.mjs"));
    const raw = readFileSync(file, "utf8");
    expect(file.replaceAll("\\", "/")).toMatch(/\.codex\/hooks\.json$/);
    expect(raw).toContain("hook-forward");
    expect(raw).toContain("cli.mjs");
    expect(raw).not.toContain("npx agent-think-map");
    expect(raw).toContain("http://127.0.0.1:3335/hook");
    expect(raw).not.toContain('"type": "http"');
  });

  it("keeps an unrelated existing hook group", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-"));
    const dir = join(cwd, ".codex");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "hooks.json"),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo keep-me", timeout: 5 }] }],
        },
      }),
    );
    const file = installCodexHooks(cwd, "http://127.0.0.1:3335/hook", join(cwd, "cli.mjs"));
    const raw = readFileSync(file, "utf8");
    expect(raw).toContain("echo keep-me");
    expect(raw).toContain("hook-forward");
    expect(raw).toContain("UserPromptSubmit");
  });

  it("can install user-level hooks that apply outside the current project", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-project-"));
    const home = mkdtempSync(join(tmpdir(), "atm-codex-home-"));
    const file = installCodexHooks(
      cwd,
      "http://127.0.0.1:3335/hook",
      join(cwd, "cli.mjs"),
      "user",
      home,
    );
    expect(file.replaceAll("\\", "/")).toMatch(/\.codex\/hooks\.json$/);
    expect(file.startsWith(join(home, ".codex"))).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("SessionStart");
  });
});
