import { TraceHub, ingestHook, type TraceHubOptions } from "../../../core/src/trace-hub.js";
export type { SessionSummary } from "../../../core/src/trace-hub.js";
import type { AgentTraceEvent, TraceUsage } from "../../../protocol/src/index.js";
import { CodexHookAdapter } from "./index.js";

export const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "SessionEnd",
] as const;

export type CodexHookEvent = (typeof CODEX_HOOK_EVENTS)[number];

export interface CommandHookHandler {
  type: "command";
  command: string;
  commandWindows?: string;
  timeout: number;
}

export interface HookMatcherGroup {
  matcher?: string;
  hooks: CommandHookHandler[];
}

export interface CodexHookSettings {
  hooks: Record<string, HookMatcherGroup[]>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function commandGroup(command: string, timeout: number): HookMatcherGroup {
  return {
    hooks: [{ type: "command", command, commandWindows: command, timeout }],
  };
}

function shellQuote(value: string): string {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function hookForwardCommand(
  hookUrl: string,
  cliJs: string,
  nodeBin = process.execPath,
): string {
  // Codex executes Windows hooks through its command runner. An absolute
  // Node path such as `C:\\Program Files\\nodejs\\node.exe` is valid in a
  // terminal but is parsed incorrectly by the runner when it contains a
  // space. `node` is already on PATH for an npm-installed CLI and avoids
  // that Windows-specific failure. Keep the explicit nodeBin for tests and
  // non-Windows callers that need a pinned runtime.
  const executable = process.platform === "win32" && nodeBin === process.execPath ? "node" : nodeBin;
  return `${shellQuote(executable)} ${shellQuote(cliJs)} hook-forward --url ${hookUrl}`;
}

function isThinkMapForwarder(command: string | undefined): boolean {
  return Boolean(command?.includes("hook-forward"));
}

export function codexHookSettings(command: string): CodexHookSettings {
  return {
    hooks: Object.fromEntries(
      CODEX_HOOK_EVENTS.map((event) => [
        event,
        [commandGroup(command, event === "SessionEnd" ? 3 : 5)],
      ]),
    ),
  };
}

export function mergeCodexHookSettings(
  existing: Record<string, unknown>,
  command: string,
): CodexHookSettings {
  const current = asRecord(existing.hooks) ?? {};
  const hooks: Record<string, HookMatcherGroup[]> = {};
  for (const event of CODEX_HOOK_EVENTS) {
    const prior = Array.isArray(current[event])
      ? (current[event] as HookMatcherGroup[])
      : [];
    const kept = prior.flatMap((group) => {
      if (!Array.isArray(group.hooks)) return [group];
      const hooks = group.hooks.filter((hook) => !isThinkMapForwarder(hook.command));
      return hooks.length ? [{ ...group, hooks }] : [];
    });
    const already = kept.some((group) =>
      group.hooks?.some((hook) => hook.type === "command" && hook.command === command),
    );
    const ours = commandGroup(command, event === "SessionEnd" ? 3 : 5);
    hooks[event] = already ? kept : [...kept, ours];
  }
  for (const [event, groups] of Object.entries(current)) {
    if (!(event in hooks) && Array.isArray(groups)) {
      hooks[event] = groups as HookMatcherGroup[];
    }
  }
  return { hooks };
}

export class CodexTraceHub extends TraceHub {
  private readonly adapters = new Map<string, CodexHookAdapter>();
  constructor(private readonly adapterOptions: TraceHubOptions & { readTranscript?: (path: string) => string | undefined } = {}) {
    super('codex', adapterOptions);
  }
  ingest(hook: unknown): Promise<AgentTraceEvent[]> {
    return this.serial(() => ingestHook(this, hook, this.adapters, () => new CodexHookAdapter(this.adapterOptions)));
  }
  override async drop(id: string) { const deleted = await super.drop(id); this.adapters.delete(id); return deleted; }
  override async close() { await super.close(); this.adapters.clear(); }
}
