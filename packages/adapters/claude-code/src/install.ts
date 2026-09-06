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
  // Token rotation replaces only this Studio's HTTP handlers, preserving others.
  const endpoint = new URL(hookUrl);
  const hooks = existing.hooks;
  if (hooks && typeof hooks === "object" && !Array.isArray(hooks)) {
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      (hooks as Record<string, unknown>)[event] = groups.flatMap((group) => {
        if (!Array.isArray(group?.hooks)) return [group];
        const kept = group.hooks.filter((hook: { type?: string; url?: string }) => {
          if (hook.type !== "http" || typeof hook.url !== "string") return true;
          try {
            const prior = new URL(hook.url);
            return prior.origin !== endpoint.origin || prior.pathname !== endpoint.pathname;
          } catch { return true; }
        });
        return kept.length ? [{ ...group, hooks: kept }] : [];
      });
    }
  }
  const merged = mergeClaudeCodeSettings(existing, hookUrl);
  writeFileSync(file, `${JSON.stringify({ ...existing, hooks: merged.hooks }, null, 2)}\n`);
  return file;
}
