import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hookForwardCommand, mergeCodexHookSettings } from "./hub.js";

export function installCodexHooks(cwd: string, hookUrl: string, cliJs: string): string {
  const dir = join(cwd, ".codex");
  const file = join(dir, "hooks.json");
  mkdirSync(dir, { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  }
  const command = hookForwardCommand(hookUrl, cliJs);
  const merged = mergeCodexHookSettings(existing, command);
  writeFileSync(file, `${JSON.stringify({ ...existing, hooks: merged.hooks }, null, 2)}\n`);
  return file;
}
