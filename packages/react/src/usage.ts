import type { TraceUsage } from "../../protocol/src/index.js";

export interface UsageDetail {
  tokens?: string;
  cache?: string;
  cost?: string;
}

function definedSum(...values: Array<number | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatTokenCompact(value: number): string {
  if (value < 1000) return String(value);
  const thousands = Math.round((value / 1000) * 10) / 10;
  return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1)}k`;
}

function formatCostUsd(value: number, compact: boolean): string {
  if (compact && value > 0 && value < 0.01) {
    return `${(value * 100).toFixed(1)}¢`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function formatUsageDetail(usage: TraceUsage): UsageDetail {
  const tokenParts: string[] = [];
  if (typeof usage.inputTokens === "number") {
    tokenParts.push(`${formatCount(usage.inputTokens)} in`);
  }
  if (typeof usage.outputTokens === "number") {
    tokenParts.push(`${formatCount(usage.outputTokens)} out`);
  }
  const cacheParts: string[] = [];
  if (typeof usage.cacheReadTokens === "number") {
    cacheParts.push(`${formatCount(usage.cacheReadTokens)} read`);
  }
  if (typeof usage.cacheCreationTokens === "number") {
    cacheParts.push(`${formatCount(usage.cacheCreationTokens)} write`);
  }
  const detail: UsageDetail = {};
  if (tokenParts.length) detail.tokens = tokenParts.join(" / ");
  if (cacheParts.length) detail.cache = cacheParts.join(" / ");
  if (typeof usage.costUsd === "number") detail.cost = formatCostUsd(usage.costUsd, false);
  return detail;
}

export function formatUsageCompact(usage: TraceUsage): string | undefined {
  const total = definedSum(
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheCreationTokens,
  );
  const parts: string[] = [];
  if (total > 0) parts.push(`${formatTokenCompact(total)} tok`);
  if (typeof usage.costUsd === "number") parts.push(formatCostUsd(usage.costUsd, true));
  return parts.length ? parts.join(" · ") : undefined;
}
