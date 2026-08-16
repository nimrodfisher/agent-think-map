import type { AgentTraceEvent, NodeKind } from "../../../protocol/src/index.js";
import {
  classifyToolName,
  reasonFor,
  redactSecrets,
  summarizeToolInput,
} from "../../../core/src/index.js";

export interface ClaudeTraceAdapterOptions {
  runId: string;
  prompt: string;
  now?: () => number;
}

interface OpenBlock {
  kind: "thinking" | "text" | "tool";
  id: string;
  name?: string;
  json: string;
  parentId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
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

export class ClaudeTraceAdapter {
  private opened = false;
  private current: OpenBlock | undefined;
  private lastId: string;
  private answerId: string | undefined;
  private seq = 0;
  private readonly userId: string;

  constructor(private readonly options: ClaudeTraceAdapterOptions) {
    this.userId = `user-${options.runId}`;
    this.lastId = this.userId;
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

    if (msg.type === "stream_event") {
      events.push(...this.onStream(asRecord(msg.event), msg.parent_tool_use_id));
    } else if (msg.type === "user") {
      events.push(...this.onToolResults(msg));
    } else if (msg.type === "assistant") {
      events.push(...this.onAssistant(msg));
    } else if (msg.type === "result") {
      events.push(...this.onResult(msg));
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

  private onStream(
    event: Record<string, unknown> | undefined,
    parentToolUseId: unknown,
  ): AgentTraceEvent[] {
    if (!event) return [];
    const parentId =
      typeof parentToolUseId === "string" && parentToolUseId
        ? parentToolUseId
        : this.lastId;

    if (event.type === "content_block_start") {
      const block = asRecord(event.content_block);
      if (block?.type === "thinking") {
        const id = this.nextId("think");
        this.current = { kind: "thinking", id, json: "" };
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
      if (block?.type === "tool_use") {
        this.current = {
          kind: "tool",
          id: String(block.id ?? this.nextId("tool")),
          name: String(block.name ?? "tool"),
          json: "",
          parentId,
        };
        return [];
      }
      if (block?.type === "text") {
        this.current = { kind: "text", id: this.answerId ?? this.nextId("answer"), json: "" };
        return [];
      }
    }

    if (event.type === "content_block_delta") {
      const delta = asRecord(event.delta);
      if (!this.current || !delta) return [];
      if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        return [
          {
            type: "node.delta",
            id: this.current.id,
            text: delta.thinking,
            ts: this.ts(),
          },
        ];
      }
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        this.current.json += delta.text;
        return [];
      }
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        this.current.json += delta.partial_json;
        return [];
      }
    }

    if (event.type === "content_block_stop" && this.current) {
      const closed = this.current;
      this.current = undefined;
      if (closed.kind === "thinking") {
        return [
          { type: "node.completed", id: closed.id, durationMs: 0, ts: this.ts() },
        ];
      }
      if (closed.kind === "tool") {
        return this.emitTool(closed);
      }
      if (closed.kind === "text" && closed.json.trim()) {
        return this.emitAnswer(closed.json);
      }
    }

    return [];
  }

  private emitTool(block: OpenBlock): AgentTraceEvent[] {
    const classified = classifyToolName(block.name ?? "tool");
    const input = redactSecrets(block.json);
    const summary = summarizeToolInput(input);
    const title =
      classified.kind === "skill" ? (summary ?? classified.title) : classified.title;
    const reason = reasonFor({
      kind: classified.kind as NodeKind,
      title,
      server: classified.server,
      tool: classified.tool,
      inputSummary: classified.kind === "skill" ? undefined : summary,
    });
    this.lastId = block.id;
    const events: AgentTraceEvent[] = [
      {
        type: "node.started",
        id: block.id,
        kind: classified.kind,
        title,
        parentId: block.parentId,
        reason,
        ts: this.ts(),
      },
    ];
    if (input) {
      events.push({ type: "tool.input", id: block.id, partial: input, ts: this.ts() });
    }
    return events;
  }

  private emitAnswer(text: string): AgentTraceEvent[] {
    const clean = redactSecrets(text);
    if (this.answerId) {
      return [
        { type: "node.delta", id: this.answerId, text: clean, ts: this.ts() },
        {
          type: "node.completed",
          id: this.answerId,
          outputPreview: clean,
          ts: this.ts(),
        },
      ];
    }
    const parentId = this.lastId;
    const id = this.nextId("answer");
    this.answerId = id;
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
      { type: "node.delta", id, text: clean, ts: this.ts() },
      { type: "node.completed", id, outputPreview: clean, ts: this.ts() },
    ];
  }

  private onToolResults(message: Record<string, unknown>): AgentTraceEvent[] {
    const payload = asRecord(message.message);
    const content = payload?.content;
    if (!Array.isArray(content)) return [];
    const events: AgentTraceEvent[] = [];
    for (const part of content) {
      const block = asRecord(part);
      if (!block || block.type !== "tool_result") continue;
      const id = String(block.tool_use_id ?? "");
      if (!id) continue;
      const output = preview(block.content);
      if (block.is_error) {
        events.push({ type: "node.failed", id, error: output || "Tool failed", ts: this.ts() });
      } else {
        events.push({
          type: "node.completed",
          id,
          outputPreview: output,
          ts: this.ts(),
        });
      }
      this.lastId = id;
    }
    return events;
  }

  private onAssistant(message: Record<string, unknown>): AgentTraceEvent[] {
    const payload = asRecord(message.message);
    const content = payload?.content;
    if (!Array.isArray(content)) return [];
    const events: AgentTraceEvent[] = [];
    for (const part of content) {
      const block = asRecord(part);
      if (!block) continue;
      if (block.type === "text" && typeof block.text === "string" && !this.answerId) {
        events.push(...this.emitAnswer(block.text));
      }
    }
    return events;
  }

  private onResult(message: Record<string, unknown>): AgentTraceEvent[] {
    const events: AgentTraceEvent[] = [];
    if (!this.answerId && typeof message.result === "string" && message.result.trim()) {
      events.push(...this.emitAnswer(message.result));
    }
    events.push({
      type: "run.completed",
      runId: this.options.runId,
      ts: this.ts(),
    });
    return events;
  }
}
