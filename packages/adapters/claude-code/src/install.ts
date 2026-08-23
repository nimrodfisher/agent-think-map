import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeClaudeCodeSettings } from "./hub.js";

export function installClaudeCodeHooks(cwd: string, hookUrl: string): string {
  const dir = join(cwd, ".claude");
  const file = join(dir, "settings.local.json");
  mkdirSync(dir, { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  }
  const merged = mergeClaudeCodeSettings(existing, hookUrl);
  writeFileSync(file, `${JSON.stringify({ ...existing, hooks: merged.hooks }, null, 2)}\n`);
  return file;
}
