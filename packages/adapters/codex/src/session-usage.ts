import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TraceUsage } from "../../../protocol/src/index.js";
import { usageFromUnknown } from "./usage.js";

const SESSION_ROOT = [".codex", "sessions"];

export function findCodexSessionLog(root: string, sessionId: string): string | undefined {
  const suffix = `-${sessionId}.jsonl`;
  const visit = (directory: string, depth: number): string | undefined => {
    if (depth > 4 || !existsSync(directory)) return undefined;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(suffix)) return path;
      if (entry.isDirectory()) {
        const found = visit(path, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  return visit(root, 0);
}

/** Read Codex's latest cumulative token count without exposing the transcript. */
export function codexSessionUsage(
  sessionId: string,
  home = homedir(),
): TraceUsage | undefined {
  if (!sessionId) return undefined;
  const file = findCodexSessionLog(join(home, ...SESSION_ROOT), sessionId);
  if (!file) return undefined;
  let lines: string[];
  try {
    lines = readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return undefined;
  }
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index]) continue;
    try {
      const record = JSON.parse(lines[index]) as Record<string, unknown>;
      const payload = record.payload as Record<string, unknown> | undefined;
      if (record.type !== "event_msg" || payload?.type !== "token_count") continue;
      const info = payload.info as Record<string, unknown> | undefined;
      const usage = usageFromUnknown(info?.total_token_usage);
      if (usage) return usage;
    } catch {
      // Ignore a partial line while Codex is still writing the session log.
    }
  }
  return undefined;
}
