import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findCodexSessionLog } from "./session-usage.js";

export interface CodexSessionMetadata {
  model?: string;
  effort?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function valueFrom(record: Record<string, unknown>, key: string): string | undefined {
  return (
    asString(record[key]) ??
    asString(asRecord(record.payload)?.[key]) ??
    asString(asRecord(record.context)?.[key])
  );
}

/** Read Codex's session configuration from its non-transcript turn context records. */
export function codexSessionMetadata(
  sessionId: string,
  home = homedir(),
): CodexSessionMetadata | undefined {
  if (!sessionId) return undefined;
  const file = findCodexSessionLog(join(home, ".codex", "sessions"), sessionId);
  if (!file) return undefined;

  let lines: string[];
  try {
    lines = readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return undefined;
  }

  const metadata: CodexSessionMetadata = {};
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index]) continue;
    try {
      const record = JSON.parse(lines[index]) as Record<string, unknown>;
      const payload = asRecord(record.payload);
      const type = asString(record.type) ?? asString(payload?.type);
      if (type !== "turn_context") continue;
      metadata.model ??= valueFrom(record, "model");
      metadata.effort ??=
        valueFrom(record, "effort") ??
        valueFrom(record, "reasoning_effort") ??
        valueFrom(record, "reasoningEffort");
      if (metadata.model && metadata.effort) return metadata;
    } catch {
      // Ignore a partial line while Codex is still writing the session log.
    }
  }
  return metadata.model || metadata.effort ? metadata : undefined;
}
