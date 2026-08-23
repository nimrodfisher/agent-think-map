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

export interface SessionSummary {
  id: string;
  prompt: string;
  live: boolean;
  updatedAt: number;
  eventCount: number;
  model?: string;
  effort?: string;
  usage?: TraceUsage;
}

type Listener = (event: AgentTraceEvent) => void;

interface SessionRecord {
  id: string;
  prompt: string;
  live: boolean;
  updatedAt: number;
  events: AgentTraceEvent[];
  adapter: ClaudeCodeHookAdapter;
  listeners: Set<Listener>;
  model?: string;
  effort?: string;
  usage?: TraceUsage;
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

export class ClaudeCodeTraceHub {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly pending = new Map<string, Set<Listener>>();

  constructor(
    private readonly options: {
      now?: () => number;
      readTranscript?: (path: string) => string | undefined;
    } = {},
  ) {}

  ingest(hook: unknown): AgentTraceEvent[] {
    const msg = asRecord(hook);
    const sessionId =
      (typeof msg?.session_id === "string" && msg.session_id) || "session";
    const session = this.ensure(sessionId);
    const events = session.adapter.ingest(hook);
    for (const event of events) {
      session.events.push(event);
      session.updatedAt = event.ts;
      if (event.type === "run.started") session.prompt = event.prompt;
      if (event.type === "run.completed") session.live = false;
      if (event.type === "run.meta") {
        if (event.model) session.model = event.model;
        if (event.effort) session.effort = event.effort;
        if (event.usage) session.usage = event.usage;
      }
      for (const listener of session.listeners) listener(event);
    }
    return events;
  }

  drop(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      prompt: session.prompt,
      live: session.live,
      updatedAt: session.updatedAt,
      eventCount: session.events.length,
      model: session.model,
      effort: session.effort,
      usage: session.usage,
    }));
  }

  subscribe(sessionId: string, listener: Listener): () => void {
    const session = this.sessions.get(sessionId);
    if (session) {
      for (const event of session.events) listener(event);
      session.listeners.add(listener);
      return () => {
        session.listeners.delete(listener);
      };
    }
    let waiters = this.pending.get(sessionId);
    if (!waiters) {
      waiters = new Set();
      this.pending.set(sessionId, waiters);
    }
    waiters.add(listener);
    return () => {
      waiters?.delete(listener);
    };
  }

  private ensure(sessionId: string): SessionRecord {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const session: SessionRecord = {
      id: sessionId,
      prompt: "",
      live: true,
      updatedAt: this.options.now?.() ?? Date.now(),
      events: [],
      adapter: new ClaudeCodeHookAdapter({
        now: this.options.now,
        readTranscript: this.options.readTranscript,
      }),
      listeners: this.pending.get(sessionId) ?? new Set(),
    };
    this.pending.delete(sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }
}
