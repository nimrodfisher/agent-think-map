import { TraceHub, ingestHook, type TraceHubOptions } from "../../../core/src/trace-hub.js";
export type { SessionSummary } from "../../../core/src/trace-hub.js";
import type { AgentTraceEvent, TraceUsage } from "../../../protocol/src/index.js";
import { ClaudeCodeHookAdapter } from "./index.js";

export const CLAUDE_CODE_HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "SessionEnd",
] as const;

export type ClaudeCodeHookEvent = (typeof CLAUDE_CODE_HOOK_EVENTS)[number];

export interface HttpHookHandler {
  type: "http";
  url: string;
  timeout: number;
}

export interface HookMatcherGroup {
  matcher?: string;
  hooks: Array<HttpHookHandler | { type: string; command?: string; url?: string; timeout?: number }>;
}

export interface ClaudeCodeHookSettings {
  hooks: Record<string, HookMatcherGroup[]>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function httpGroup(url: string): HookMatcherGroup {
  return {
    hooks: [{ type: "http", url, timeout: 5 }],
  };
}

export function claudeCodeHookSettings(url: string): ClaudeCodeHookSettings {
  const group = httpGroup(url);
  return {
    hooks: Object.fromEntries(CLAUDE_CODE_HOOK_EVENTS.map((event) => [event, [group]])),
  };
}

export function mergeClaudeCodeSettings(
  existing: Record<string, unknown>,
  url: string,
): ClaudeCodeHookSettings {
  const current = asRecord(existing.hooks) ?? {};
  const ours = httpGroup(url);
  const hooks: Record<string, HookMatcherGroup[]> = {};
  for (const event of CLAUDE_CODE_HOOK_EVENTS) {
    const prior = Array.isArray(current[event])
      ? (current[event] as HookMatcherGroup[])
      : [];
    const already = prior.some((group) =>
      group.hooks?.some((hook) => hook.type === "http" && hook.url === url),
    );
    hooks[event] = already ? prior : [...prior, ours];
  }
  for (const [event, groups] of Object.entries(current)) {
    if (!(event in hooks) && Array.isArray(groups)) {
      hooks[event] = groups as HookMatcherGroup[];
    }
  }
  return { hooks };
}

export class ClaudeCodeTraceHub extends TraceHub {
  private readonly adapters = new Map<string, ClaudeCodeHookAdapter>();
  constructor(private readonly adapterOptions: TraceHubOptions & { readTranscript?: (path: string) => string | undefined } = {}) {
    super('claude-code', adapterOptions);
  }
  ingest(hook: unknown): Promise<AgentTraceEvent[]> {
    return this.serial(() => ingestHook(this, hook, this.adapters, () => new ClaudeCodeHookAdapter(this.adapterOptions)));
  }
  override async drop(id: string) { const deleted = await super.drop(id); this.adapters.delete(id); return deleted; }
  override async close() { await super.close(); this.adapters.clear(); }
}
