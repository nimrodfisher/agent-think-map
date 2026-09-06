import { readConfig, parseConfig, writeConfig } from "../../shared/config.js";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { hookForwardCommand, mergeCodexHookSettings } from "./hub.js";

export function codexProjectRoot(cwd: string): string {
  try {
    const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return resolve(root);
  } catch {
    // Codex also supports non-repository directories; keep the old cwd behavior there.
  }
  return resolve(cwd);
}

export type CodexHookScope = "project" | "user";

export function codexUserRoot(home = homedir()): string {
  return join(home, ".codex");
}

export function installCodexHooks(
  cwd: string,
  hookUrl: string,
  cliJs: string,
  scope: CodexHookScope = "project",
  home = homedir(),
): string {
  const dir = scope === "user" ? codexUserRoot(home) : join(codexProjectRoot(cwd), ".codex");
  const file = join(dir, "hooks.json");
  mkdirSync(dir, { recursive: true });
  const before = readConfig(file);
  const existing = parseConfig(before);
  const command = hookForwardCommand(hookUrl, cliJs);
  const merged = mergeCodexHookSettings(existing, command);
  writeConfig(file, before, { ...existing, hooks: merged.hooks });
  return file;
}
