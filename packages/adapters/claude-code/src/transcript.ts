import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { TraceUsage } from "../../../protocol/src/index.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function addNum(left?: number, right?: number): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  return (left ?? 0) + (right ?? 0);
}

export function addUsage(left?: TraceUsage, right?: TraceUsage): TraceUsage | undefined {
  if (!left && !right) return undefined;
  const usage: TraceUsage = {
    inputTokens: addNum(left?.inputTokens, right?.inputTokens),
    outputTokens: addNum(left?.outputTokens, right?.outputTokens),
    cacheReadTokens: addNum(left?.cacheReadTokens, right?.cacheReadTokens),
    cacheCreationTokens: addNum(left?.cacheCreationTokens, right?.cacheCreationTokens),
    costUsd: addNum(left?.costUsd, right?.costUsd),
  };
  return Object.values(usage).some((value) => value !== undefined) ? usage : undefined;
}

export function usageFromUnknown(value: unknown): TraceUsage | undefined {
  const root = asRecord(value);
  if (!root) return undefined;
  const raw = asRecord(root.usage) ?? asRecord(asRecord(root.message)?.usage) ?? root;
  const usage: TraceUsage = {
    inputTokens: numberField(raw, "inputTokens") ?? numberField(raw, "input_tokens"),
    outputTokens: numberField(raw, "outputTokens") ?? numberField(raw, "output_tokens"),
    cacheReadTokens:
      numberField(raw, "cacheReadTokens") ?? numberField(raw, "cache_read_input_tokens"),
    cacheCreationTokens:
      numberField(raw, "cacheCreationTokens") ??
      numberField(raw, "cache_creation_input_tokens"),
    costUsd:
      numberField(root, "total_cost_usd") ??
      numberField(root, "totalCostUsd") ??
      numberField(raw, "costUsd") ??
      numberField(raw, "cost_usd"),
  };
  return Object.values(usage).some((value) => value !== undefined) ? usage : undefined;
}

export function usageFromTranscriptText(text: string): TraceUsage | undefined {
  let usage: TraceUsage | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      usage = addUsage(usage, usageFromUnknown(JSON.parse(line)));
    } catch {
      /* skip malformed lines */
    }
  }
  return usage;
}

export function modelFromUnknown(value: unknown): string | undefined {
  const root = asRecord(value);
  if (!root) return undefined;
  return asString(root.model) ?? asString(asRecord(root.message)?.model);
}

export function modelFromTranscriptText(text: string): string | undefined {
  let model: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as unknown;
      const root = asRecord(record);
      if (root?.isSidechain === true) continue;
      const found = modelFromUnknown(record);
      if (found) model = found;
    } catch {
      /* skip malformed lines */
    }
  }
  return model;
}

export function resolveTranscriptPath(path: string): string {
  let value = path.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    value = join(homedir(), value.slice(2));
  }
  const msys = value.match(/^\/([a-zA-Z])\/(.*)$/);
  if (msys && process.platform === "win32") {
    return `${msys[1].toUpperCase()}:\\${msys[2].replace(/\//g, "\\")}`;
  }
  return value;
}

export function readTranscriptFile(path: string): string | undefined {
  try {
    return readFileSync(resolveTranscriptPath(path), "utf8");
  } catch {
    return undefined;
  }
}
