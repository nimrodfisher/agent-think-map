import type { AgentTraceEvent, NodeKind, TraceUsage } from "../../../protocol/src/index.js";
import {
  classifyToolName,
  parseToolInput,
  reasonFor,
  redactSecrets,
  summarizeToolInput,
} from "../../../core/src/index.js";
import { addUsage, usageFromUnknown } from "./usage.js";

export interface CodexHookAdapterOptions {
  now?: () => number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function effortFrom(msg: Record<string, unknown>): string | undefined {
  if (typeof msg.effort === "string") return asString(msg.effort);
  return asString(asRecord(msg.effort)?.level);
}

function modelFrom(msg: Record<string, unknown>): string | undefined {
  return (
    asString(msg.model) ??
    asString(asRecord(msg.message)?.model) ??
    asString(asRecord(msg.tool_response)?.resolvedModel) ??
    asString(asRecord(msg.tool_input)?.model)
  );
}

function preview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return redactSecrets(value).slice(0, 8000);
  try {
    return redactSecrets(JSON.stringify(value, null, 2)).slice(0, 8000);
  } catch {
    return "";
  }
}

function inputJson(value: unknown): string {
  if (typeof value === "string") return redactSecrets(value);
  if (value == null) return "";
  try {
    return redactSecrets(JSON.stringify(value));
  } catch {
    return "";
  }
}

function toolFailed(response: unknown): boolean {
  const rec = asRecord(response);
  if (!rec) return false;
  const exit = asNumber(rec.exit_code);
  if (exit !== undefined && exit !== 0) return true;
  return rec.status === "failed";
}

export class CodexHookAdapter {
  private opened = false;
  private lastId = "";
  private spineId = "";
  private seq = 0;
  private runId = "";
  private model: string | undefined;
  private effort: string | undefined;
  private usage: TraceUsage | undefined;

  constructor(private readonly options: CodexHookAdapterOptions = {}) {}

  ingest(hook: unknown): AgentTraceEvent[] {
    const msg = asRecord(hook);
    if (!msg) return [];
    const eventName = asString(msg.hook_event_name);
    if (!eventName) return [];
    const context = this.noteContext(msg);

    if (!this.opened && eventName !== "UserPromptSubmit") {
      const sessionId = asString(msg.session_id) ?? "session";
      return [...this.openRun(sessionId, "(session)"), ...this.ingest(hook)];
    }

    let handled: AgentTraceEvent[];
    switch (eventName) {
      case "UserPromptSubmit":
        handled = [...context, ...this.onPrompt(msg)];
        break;
      case "PreToolUse":
        handled = [...context, ...this.onPreTool(msg)];
        break;
      case "PostToolUse":
        handled = [...context, ...this.onPostTool(msg)];
        break;
      case "SubagentStart":
        handled = [...context, ...this.onSubagentStart(msg)];
        break;
      case "SubagentStop":
        handled = [...context, ...this.onSubagentStop(msg)];
        break;
      case "Stop":
        handled = [...context, ...this.onStop(msg)];
        break;
      case "SessionEnd":
        handled = [...context, ...this.onSessionEnd()];
        break;
      default:
        handled = [];
    }
    return handled;
  }

  private ts(): number {
    return this.options.now?.() ?? Date.now();
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private metaEvent(): AgentTraceEvent[] {
    if (!this.opened || (!this.model && !this.effort && !this.usage)) return [];
    return [
      {
        type: "run.meta",
        runId: this.runId,
        model: this.model,
        effort: this.effort,
        usage: this.usage,
        ts: this.ts(),
      },
    ];
  }

  private noteContext(msg: Record<string, unknown>): AgentTraceEvent[] {
    if (!this.opened) return [];
    let changed = false;
    const model = modelFrom(msg);
    const effort = effortFrom(msg);
    if (model && model !== this.model) {
      this.model = model;
      changed = true;
    }
    if (effort && effort !== this.effort) {
      this.effort = effort;
      changed = true;
    }
    return changed ? this.metaEvent() : [];
  }

  private openRun(runId: string, prompt: string): AgentTraceEvent[] {
    this.opened = true;
    this.runId = runId;
    this.spineId = `user-${runId}`;
    this.lastId = this.spineId;
    return [
      {
        type: "run.started",
        runId,
        prompt,
        ts: this.ts(),
      },
    ];
  }

  private onPrompt(msg: Record<string, unknown>): AgentTraceEvent[] {
    const prompt = asString(msg.prompt) ?? "";
    const sessionId = asString(msg.session_id) ?? "session";
    if (!this.opened) {
      return [...this.openRun(sessionId, prompt), ...this.noteContext(msg)];
    }
    const id = this.nextId("user");
    const parentId = this.spineId || this.lastId;
    this.spineId = id;
    this.lastId = id;
    return [
      {
        type: "node.started",
        id,
        kind: "user",
        title: "User",
        parentId,
        ts: this.ts(),
      },
      { type: "node.delta", id, text: prompt, ts: this.ts() },
      { type: "node.completed", id, outputPreview: prompt, ts: this.ts() },
    ];
  }

  private onPreTool(msg: Record<string, unknown>): AgentTraceEvent[] {
    const id = asString(msg.tool_use_id) ?? this.nextId("tool");
    const name = asString(msg.tool_name) ?? "tool";
    const input = inputJson(msg.tool_input);
    const parsed = asRecord(msg.tool_input) ?? parseToolInput(input);
    const classified = classifyToolName(name, parsed);
    const summary = summarizeToolInput(input, parsed);
    const title =
      classified.kind === "skill"
        ? classified.title === name
          ? (summary ?? classified.title)
          : classified.title
        : classified.title;
    const description = asString(asRecord(msg.tool_input)?.description);
    const reason =
      description ??
      reasonFor({
        kind: classified.kind as NodeKind,
        title,
        server: classified.server,
        tool: classified.tool,
        inputSummary: classified.kind === "skill" ? undefined : summary,
      });
    const parentId = asString(msg.agent_id) ?? (this.spineId || this.lastId);
    const events: AgentTraceEvent[] = [
      {
        type: "node.started",
        id,
        kind: classified.kind,
        title,
        parentId,
        reason,
        ts: this.ts(),
      },
    ];
    if (input) {
      events.push({ type: "tool.input", id, partial: input, ts: this.ts() });
    }
    return events;
  }

  private onPostTool(msg: Record<string, unknown>): AgentTraceEvent[] {
    const id = asString(msg.tool_use_id);
    if (!id) return [];
    const piece = usageFromUnknown(msg.tool_response) ?? usageFromUnknown(msg);
    if (piece) this.usage = addUsage(this.usage, piece);
    const output = preview(msg.tool_response ?? msg.error_message);
    const meta = piece ? this.metaEvent() : [];
    if (toolFailed(msg.tool_response)) {
      return [
        {
          type: "node.failed",
          id,
          error: asString(msg.error_message) || output || "Tool failed",
          usage: piece,
          ts: this.ts(),
        },
        ...meta,
      ];
    }
    return [
      {
        type: "node.completed",
        id,
        outputPreview: output,
        usage: piece,
        ts: this.ts(),
      },
      ...meta,
    ];
  }

  private onSubagentStart(msg: Record<string, unknown>): AgentTraceEvent[] {
    const id = asString(msg.agent_id) ?? this.nextId("agent");
    const title = asString(msg.agent_type) ?? "Subagent";
    const parentId = this.spineId || this.lastId;
    return [
      {
        type: "node.started",
        id,
        kind: "subagent",
        title,
        parentId,
        reason: `Spawned ${title}`,
        ts: this.ts(),
      },
    ];
  }

  private onSubagentStop(msg: Record<string, unknown>): AgentTraceEvent[] {
    const id = asString(msg.agent_id);
    if (!id) return [];
    const output = asString(msg.last_assistant_message);
    return [
      {
        type: "node.completed",
        id,
        outputPreview: output,
        ts: this.ts(),
      },
    ];
  }

  private onStop(msg: Record<string, unknown>): AgentTraceEvent[] {
    const text = asString(msg.last_assistant_message);
    if (!text) return [];
    const id = this.nextId("answer");
    const parentId = this.spineId || this.lastId;
    this.spineId = id;
    this.lastId = id;
    return [
      {
        type: "node.started",
        id,
        kind: "answer",
        title: "Answer",
        parentId,
        ts: this.ts(),
      },
      { type: "node.delta", id, text, ts: this.ts() },
      { type: "node.completed", id, outputPreview: text, ts: this.ts() },
    ];
  }

  private onSessionEnd(): AgentTraceEvent[] {
    if (!this.opened) return [];
    return [
      {
        type: "run.completed",
        runId: this.runId,
        usage: this.usage,
        ts: this.ts(),
      },
    ];
  }
}
