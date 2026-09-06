import { readConfig, parseConfig, writeConfig } from "../../shared/config.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { mergeClaudeCodeSettings } from "./hub.js";

/** Only refresh a project that already opted into this exact Studio endpoint. */
export function hasClaudeCodeHooks(cwd: string, origin: string): boolean {
  const settings = parseConfig(readConfig(join(cwd, ".claude", "settings.local.json")));
  return Object.values(settings.hooks ?? {}).some((groups) => Array.isArray(groups) && groups.some(group =>
    Array.isArray(group?.hooks) && group.hooks.some((hook: { type?: string; url?: string }) => {
      if (hook.type !== "http" || typeof hook.url !== "string") return false;
      try {
        const url = new URL(hook.url);
        return url.origin === origin && url.pathname === "/hook";
      } catch { return false; }
    })));
}

export function installClaudeCodeHooks(cwd: string, hookUrl: string): string {
  const dir = join(cwd, ".claude");
  const file = join(dir, "settings.local.json");
  mkdirSync(dir, { recursive: true });
  const before = readConfig(file);
  const existing = parseConfig(before);
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
  writeConfig(file, before, { ...existing, hooks: merged.hooks });
  return file;
}
