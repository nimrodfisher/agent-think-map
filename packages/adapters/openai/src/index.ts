import type { AgentTraceEvent, NodeKind, TraceUsage } from "../../../protocol/src/index.js";
import {
  classifyToolName,
  reasonFor,
  redactSecrets,
  summarizeToolInput,
} from "../../../core/src/index.js";

export interface OpenAITraceAdapterOptions {
  runId: string;
  prompt: string;
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

function preview(value: unknown): string {
  if (typeof value === "string") return redactSecrets(value).slice(0, 800);
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        const rec = asRecord(part);
        if (rec && typeof rec.text === "string") return rec.text;
        if (typeof part === "string") return part;
        return JSON.stringify(part);
      })
      .join("")
      .slice(0, 800);
  }
  try {
    return redactSecrets(JSON.stringify(value)).slice(0, 800);
  } catch {
    return "";
  }
}

function usageFromUnknown(value: unknown): TraceUsage | undefined {
  const root = asRecord(value);
  const raw =
    asRecord(root?.usage) ??
    asRecord(asRecord(root?.response)?.usage) ??
    asRecord(asRecord(root?.params)?.usage) ??
    root;
  if (!raw) return undefined;
  const details = asRecord(raw.input_tokens_details) ?? asRecord(raw.prompt_tokens_details);
  const usage: TraceUsage = {
    inputTokens: asNumber(raw.inputTokens) ?? asNumber(raw.input_tokens) ?? asNumber(raw.prompt_tokens),
    outputTokens:
      asNumber(raw.outputTokens) ?? asNumber(raw.output_tokens) ?? asNumber(raw.completion_tokens),
    cacheReadTokens:
      asNumber(raw.cacheReadTokens) ??
      asNumber(raw.cache_read_input_tokens) ??
      asNumber(raw.cached_tokens) ??
      asNumber(details?.cached_tokens),
    cacheCreationTokens:
      asNumber(raw.cacheCreationTokens) ?? asNumber(raw.cache_creation_input_tokens),
    costUsd: asNumber(raw.costUsd) ?? asNumber(raw.total_cost_usd) ?? asNumber(raw.cost_usd),
  };
  return Object.values(usage).some((field) => field !== undefined) ? usage : undefined;
}

function nestedItem(value: Record<string, unknown>): Record<string, unknown> {
  return (
    asRecord(value.raw_item) ??
    asRecord(value.rawItem) ??
    asRecord(value.item) ??
    value
  );
}

function itemId(item: Record<string, unknown>, fallback: string): string {
  const raw = nestedItem(item);
  return (
    asString(item.call_id) ??
    asString(item.id) ??
    asString(raw.call_id) ??
    asString(raw.id) ??
    fallback
  );
}

function itemText(item: Record<string, unknown>): string {
  const raw = nestedItem(item);
  const content = raw.content ?? item.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return preview(content);
  return asString(raw.text) ?? asString(item.text) ?? asString(item.output) ?? "";
}

function toolArguments(item: Record<string, unknown>): string {
  const raw = nestedItem(item);
  const value = raw.arguments ?? raw.params ?? raw.input ?? item.arguments ?? item.params;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function normalizeType(value: unknown): string {
  return asString(value)?.replace(/[\s-]/g, "_").toLowerCase() ?? "";
}

export class OpenAITraceAdapter {
  private opened = false;
  private lastId: string;
  private answerId: string | undefined;
  private thinkingId: string | undefined;
  private startedIds = new Set<string>();
  private seq = 0;
  private readonly options: OpenAITraceAdapterOptions;

  constructor(options: OpenAITraceAdapterOptions) {
    this.options = options;
    this.lastId = `user-${options.runId}`;
  }

  ingest(message: unknown): AgentTraceEvent[] {
    const events: AgentTraceEvent[] = [];
    if (!this.opened) {
      this.opened = true;
      events.push({
        type: "run.started",
        runId: this.options.runId,
        prompt: this.options.prompt,
        ts: this.ts(),
      });
    }

    const msg = asRecord(message);
    if (!msg) return events;

    if (typeof msg.method === "string") {
      events.push(...this.onCodexMethod(msg.method, asRecord(msg.params) ?? {}));
      return events;
    }

    const type = asString(msg.type);
    if (type === "raw_model_stream_event" || type === "raw_response_event") {
      events.push(...this.onRaw(msg));
    } else if (type === "run_item_stream_event") {
      events.push(...this.onRunItem(asString(msg.name), asRecord(msg.item) ?? {}));
    } else if (type === "agent_updated_stream_event") {
      const agent = asRecord(msg.agent) ?? asRecord(msg.new_agent);
      events.push(...this.emitSubagent(asString(agent?.name) ?? "Agent"));
    } else if (type === "turn.completed" || type === "turn_completed" || type === "run.completed") {
      events.push(...this.finish(usageFromUnknown(msg)));
    }

    return events;
  }

  private ts(): number {
    return this.options.now?.() ?? Date.now();
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private onRaw(event: Record<string, unknown>): AgentTraceEvent[] {
    const data = asRecord(event.data) ?? event;
    const payload = asRecord(data.event) ?? data;
    const kind = normalizeType(payload.type ?? data.type);
    const delta =
      asString(payload.delta) ??
      asString(asRecord(payload.delta)?.text) ??
      asString(asRecord(payload.delta)?.reasoning);

    if (delta && kind.includes("reason")) {
      return this.appendThinking(delta);
    }
    if (delta && (kind.includes("output_text") || kind.endsWith("text.delta") || kind === "output_text_delta")) {
      return this.appendAnswer(delta, false);
    }
    if (kind.includes("completed") || kind === "response.completed") {
      return this.finish(usageFromUnknown(payload) ?? usageFromUnknown(data) ?? usageFromUnknown(event));
    }
    return [];
  }

  private onRunItem(name: string | undefined, item: Record<string, unknown>): AgentTraceEvent[] {
    const eventName = normalizeType(name);
    const itemType = normalizeType(item.type);

    if (eventName === "reasoning_item_created" || itemType === "reasoning_item") {
      return this.completeThinking(itemId(item, this.thinkingId ?? this.nextId("think")));
    }
    if (eventName === "tool_called" || itemType === "tool_call_item") {
      return this.emitTool(item);
    }
    if (eventName === "tool_output" || itemType === "tool_call_output_item") {
      return this.completeTool(item);
    }
    if (
      eventName === "message_output_created" ||
      itemType === "message_output_item" ||
      itemType === "message_output"
    ) {
      return this.appendAnswer(itemText(item) || preview(item.output), true);
    }
    if (
      eventName === "handoff_requested" ||
      eventName === "handoff_occured" ||
      eventName === "handoff_occurred" ||
      itemType === "handoff_call" ||
      itemType === "handoff_output_item"
    ) {
      const raw = nestedItem(item);
      return this.emitSubagent(
        asString(item.name) ?? asString(raw.name) ?? asString(item.target) ?? "Agent",
        itemId(item, this.nextId("sub")),
      );
    }
    if (eventName === "mcp_list_tools") {
      const raw = nestedItem(item);
      const server = asString(raw.server_label) ?? asString(raw.server) ?? "mcp";
      return this.emitTool({
        ...item,
        raw_item: { type: "mcp_call", id: itemId(item, this.nextId("mcp")), server_label: server, name: "list_tools" },
      });
    }
    return [];
  }

  private onCodexMethod(method: string, params: Record<string, unknown>): AgentTraceEvent[] {
    const item = asRecord(params.item) ?? params;
    const itemType = normalizeType(item.type);
    const id = asString(params.itemId) ?? asString(params.item_id) ?? itemId(item, this.nextId("item"));

    if (method === "item/started" || method === "item.started") {
      if (itemType.includes("reason")) return this.startThinking(id);
      if (itemType.includes("command") || itemType.includes("mcp") || itemType.includes("tool")) {
        return this.emitCodexItem(id, item, false);
      }
      if (itemType.includes("agent") && itemType.includes("message")) {
        return this.appendAnswer(itemText(item), false);
      }
      return [];
    }

    if (method === "item/agentMessage/delta" || method.endsWith("/delta") || method === "item/delta") {
      const delta = asString(params.delta) ?? itemText(item);
      if (!delta) return [];
      if (id === this.thinkingId || itemType.includes("reason")) return this.appendThinking(delta, id);
      return this.appendAnswer(delta, false);
    }

    if (method === "item/completed" || method === "item.completed") {
      if (itemType.includes("reason")) return this.completeThinking(id);
      if (itemType.includes("command") || itemType.includes("mcp") || itemType.includes("tool")) {
        return this.emitCodexItem(id, item, true);
      }
      if (itemType.includes("agent") && itemType.includes("message")) {
        return this.appendAnswer(itemText(item), true);
      }
      return [];
    }

    if (method === "turn/started" || method === "thread/started") return [];
    if (method === "turn/completed" || method === "turn.completed" || method === "thread/completed") {
      return this.finish(usageFromUnknown(params) ?? usageFromUnknown(item));
    }
    return [];
  }

  private startThinking(id: string): AgentTraceEvent[] {
    if (this.thinkingId) return [];
    const parentId = this.lastId;
    this.thinkingId = id;
    this.lastId = id;
    return [
      {
        type: "node.started",
        id,
        kind: "thinking",
        title: "Thinking",
        parentId,
        ts: this.ts(),
      },
    ];
  }

  private appendThinking(text: string, id?: string): AgentTraceEvent[] {
    const events: AgentTraceEvent[] = [];
    if (!this.thinkingId) {
      events.push(...this.startThinking(id ?? this.nextId("think")));
    }
    events.push({
      type: "node.delta",
      id: this.thinkingId ?? id ?? this.nextId("think"),
      text: redactSecrets(text),
      ts: this.ts(),
    });
    return events;
  }

  private completeThinking(id: string): AgentTraceEvent[] {
    const events: AgentTraceEvent[] = [];
    if (!this.thinkingId) events.push(...this.startThinking(id));
    const thinkId = this.thinkingId ?? id;
    events.push({ type: "node.completed", id: thinkId, ts: this.ts() });
    this.thinkingId = undefined;
    this.lastId = thinkId;
    return events;
  }

  private emitTool(item: Record<string, unknown>): AgentTraceEvent[] {
    const raw = nestedItem(item);
    const origin = asRecord(item.tool_origin) ?? asRecord(raw.tool_origin);
    const server =
      asString(origin?.mcp_server_name) ??
      asString(raw.server_label) ??
      asString(raw.server) ??
      asString(item.server);
    const toolName =
      asString(item.tool_name) ??
      asString(raw.name) ??
      asString(item.name) ??
      asString(raw.tool) ??
      asString(item.tool) ??
      "tool";
    const id = itemId(item, this.nextId("tool"));
    const classifiedName =
      server && (normalizeType(raw.type).includes("mcp") || origin?.type === "mcp")
        ? `mcp__${server}__${toolName}`
        : toolName;
    return this.startClassifiedTool(id, classifiedName, toolArguments(item));
  }

  private emitCodexItem(
    id: string,
    item: Record<string, unknown>,
    completed: boolean,
  ): AgentTraceEvent[] {
    const itemType = normalizeType(item.type);
    const events: AgentTraceEvent[] = [];
    if (itemType.includes("mcp")) {
      const server = asString(item.server) ?? asString(nestedItem(item).server) ?? "mcp";
      const tool = asString(item.tool) ?? asString(item.name) ?? "tool";
      events.push(...this.startClassifiedTool(id, `mcp__${server}__${tool}`, toolArguments(item)));
    } else {
      const command = asString(item.command) ?? asString(nestedItem(item).command) ?? "";
      const title = command.split(/\s+/)[0] || "command";
      events.push(...this.startClassifiedTool(id, title, command ? JSON.stringify({ command }) : toolArguments(item)));
    }
    if (completed) {
      const output = asString(item.output) ?? preview(item.result ?? item.content);
      events.push({
        type: "node.completed",
        id,
        outputPreview: output || undefined,
        ts: this.ts(),
      });
      this.lastId = id;
    }
    return events;
  }

  private startClassifiedTool(id: string, name: string, input: string): AgentTraceEvent[] {
    if (this.startedIds.has(id)) return [];
    this.startedIds.add(id);
    const classified = classifyToolName(name);
    const clean = redactSecrets(input);
    const summary = summarizeToolInput(clean);
    const title =
      classified.kind === "skill" ? (summary ?? classified.title) : classified.title;
    const reason = reasonFor({
      kind: classified.kind as NodeKind,
      title,
      server: classified.server,
      tool: classified.tool,
      inputSummary: classified.kind === "skill" ? undefined : summary,
    });
    const parentId = this.lastId;
    this.lastId = id;
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
    if (clean) events.push({ type: "tool.input", id, partial: clean, ts: this.ts() });
    return events;
  }

  private completeTool(item: Record<string, unknown>): AgentTraceEvent[] {
    const id = itemId(item, this.lastId);
    const output = asString(item.output) ?? preview(nestedItem(item).output ?? item.result);
    this.lastId = id;
    if (asString(item.status) === "failed" || item.is_error === true) {
      return [{ type: "node.failed", id, error: output || "Tool failed", ts: this.ts() }];
    }
    return [
      {
        type: "node.completed",
        id,
        outputPreview: output || undefined,
        ts: this.ts(),
      },
    ];
  }

  private emitSubagent(title: string, id = this.nextId("sub")): AgentTraceEvent[] {
    const parentId = this.lastId;
    this.lastId = id;
    return [
      {
        type: "node.started",
        id,
        kind: "subagent",
        title,
        parentId,
        reason: `Handed off to ${title}`,
        ts: this.ts(),
      },
      { type: "node.completed", id, ts: this.ts() },
    ];
  }

  private appendAnswer(text: string, complete: boolean): AgentTraceEvent[] {
    const clean = redactSecrets(text);
    if (!clean && !complete) return [];
    const events: AgentTraceEvent[] = [];
    if (!this.answerId) {
      const id = this.nextId("answer");
      this.answerId = id;
      events.push({
        type: "node.started",
        id,
        kind: "answer",
        title: "Answer",
        parentId: this.lastId,
        ts: this.ts(),
      });
      this.lastId = id;
    }
    if (clean) {
      events.push({ type: "node.delta", id: this.answerId, text: clean, ts: this.ts() });
    }
    if (complete) {
      events.push({
        type: "node.completed",
        id: this.answerId,
        outputPreview: clean || undefined,
        ts: this.ts(),
      });
    }
    return events;
  }

  private finish(usage?: TraceUsage): AgentTraceEvent[] {
    const events: AgentTraceEvent[] = [];
    if (this.thinkingId) {
      events.push({ type: "node.completed", id: this.thinkingId, ts: this.ts() });
      this.thinkingId = undefined;
    }
    if (this.answerId) {
      events.push({ type: "node.completed", id: this.answerId, usage, ts: this.ts() });
    }
    events.push({
      type: "run.completed",
      runId: this.options.runId,
      usage,
      ts: this.ts(),
    });
    return events;
  }
}

export { OpenAITraceAdapter as CodexTraceAdapter };
export type CodexTraceAdapterOptions = OpenAITraceAdapterOptions;
