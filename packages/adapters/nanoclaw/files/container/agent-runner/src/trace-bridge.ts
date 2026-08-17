/**
 * Container-side bridge. Copy to container/agent-runner/src/trace-bridge.ts
 * Wraps provider.query(), maps Claude Agent SDK messages to AgentTraceEvent,
 * and writes kind:"trace" rows through the runner's outbound writer.
 */
export const TRACE_MESSAGE_KIND = "trace";

type TraceEvent = {
  type: string;
  [key: string]: unknown;
};

type WriteTrace = (row: { kind: string; payload: TraceEvent }) => void | Promise<void>;

function classify(name: string): { kind: string; title: string; server?: string; tool?: string } {
  if (name === "Skill" || name.toLowerCase() === "skill") return { kind: "skill", title: name };
  if (name === "Task") return { kind: "subagent", title: "Task" };
  if (name.startsWith("mcp__")) {
    const [, server = "unknown", ...rest] = name.split("__");
    const tool = rest.join("__");
    return { kind: "mcp", title: `${server} / ${tool}`, server, tool };
  }
  return { kind: "tool", title: name };
}

function redact(text: string): string {
  return text
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9]{16,}/g, "[redacted]")
    .replace(/\bghp_[A-Za-z0-9]{8,}/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "[redacted]");
}

function usageFromResult(message: Record<string, unknown>): Record<string, number> | undefined {
  const raw = message.usage;
  const bag = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const usage: Record<string, number> = {};
  if (typeof bag.input_tokens === "number") usage.inputTokens = bag.input_tokens;
  if (typeof bag.output_tokens === "number") usage.outputTokens = bag.output_tokens;
  if (typeof bag.cache_read_input_tokens === "number") {
    usage.cacheReadTokens = bag.cache_read_input_tokens;
  }
  if (typeof bag.cache_creation_input_tokens === "number") {
    usage.cacheCreationTokens = bag.cache_creation_input_tokens;
  }
  if (typeof message.total_cost_usd === "number") usage.costUsd = message.total_cost_usd;
  return Object.keys(usage).length ? usage : undefined;
}

class MiniAdapter {
  opened = false;
  lastId: string;
  seq = 0;
  current:
    | { kind: "thinking" | "tool" | "text"; id: string; name?: string; json: string; parentId?: string }
    | undefined;
  constructor(private runId: string, private prompt: string) {
    this.lastId = `user-${runId}`;
  }
  ingest(message: unknown): TraceEvent[] {
    const events: TraceEvent[] = [];
    const ts = Date.now();
    if (!this.opened) {
      this.opened = true;
      events.push({ type: "run.started", runId: this.runId, prompt: this.prompt, ts });
    }
    const msg = message as { type?: string; event?: Record<string, unknown>; message?: { content?: unknown[] } };
    if (msg.type === "stream_event") events.push(...this.stream(msg.event ?? {}, ts));
    if (msg.type === "user") events.push(...this.results(msg, ts));
    if (msg.type === "assistant") {
      const content = msg.message?.content ?? [];
      for (const part of content) {
        const block = part as { type?: string; text?: string };
        if (block.type === "text" && block.text) {
          const id = `answer-${++this.seq}`;
          events.push(
            { type: "node.started", id, kind: "answer", title: "Answer", parentId: this.lastId, ts },
            { type: "node.delta", id, text: block.text, ts },
            { type: "node.completed", id, outputPreview: block.text, ts },
          );
          this.lastId = id;
        }
      }
    }
    if (msg.type === "result") {
      const usage = usageFromResult(message as Record<string, unknown>);
      events.push({ type: "run.completed", runId: this.runId, ts, ...(usage ? { usage } : {}) });
    }
    return events;
  }
  private stream(event: Record<string, unknown>, ts: number): TraceEvent[] {
    if (event.type === "content_block_start") {
      const block = (event.content_block ?? {}) as { type?: string; id?: string; name?: string };
      if (block.type === "thinking") {
        const id = `think-${++this.seq}`;
        this.current = { kind: "thinking", id, json: "" };
        const parentId = this.lastId;
        this.lastId = id;
        return [{ type: "node.started", id, kind: "thinking", title: "Thinking", parentId, ts }];
      }
      if (block.type === "tool_use") {
        this.current = {
          kind: "tool",
          id: String(block.id ?? `tool-${++this.seq}`),
          name: String(block.name ?? "tool"),
          json: "",
          parentId: this.lastId,
        };
      }
    }
    if (event.type === "content_block_delta") {
      const delta = (event.delta ?? {}) as { type?: string; thinking?: string; partial_json?: string };
      if (this.current?.kind === "thinking" && delta.type === "thinking_delta" && delta.thinking) {
        return [{ type: "node.delta", id: this.current.id, text: delta.thinking, ts }];
      }
      if (this.current?.kind === "tool" && delta.type === "input_json_delta" && delta.partial_json) {
        this.current.json += delta.partial_json;
      }
    }
    if (event.type === "content_block_stop" && this.current) {
      const cur = this.current;
      this.current = undefined;
      if (cur.kind === "thinking") return [{ type: "node.completed", id: cur.id, ts }];
      if (cur.kind === "tool") {
        const classified = classify(cur.name ?? "tool");
        let title = classified.title;
        const input = redact(cur.json);
        try {
          const parsed = JSON.parse(input) as { skill?: string; path?: string; name?: string };
          if (classified.kind === "skill") title = parsed.skill ?? parsed.name ?? title;
        } catch {
          /* ignore */
        }
        this.lastId = cur.id;
        const reason =
          classified.kind === "skill"
            ? `Loaded ${title} because the task matched that skill`
            : classified.kind === "mcp"
              ? `Called ${classified.tool} on server ${classified.server}`
              : `Used ${title}`;
        const out: TraceEvent[] = [
          {
            type: "node.started",
            id: cur.id,
            kind: classified.kind,
            title,
            parentId: cur.parentId,
            reason,
            ts,
          },
        ];
        if (input) out.push({ type: "tool.input", id: cur.id, partial: input, ts });
        return out;
      }
    }
    return [];
  }
  private results(msg: { message?: { content?: unknown[] } }, ts: number): TraceEvent[] {
    const events: TraceEvent[] = [];
    for (const part of msg.message?.content ?? []) {
      const block = part as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean };
      if (block.type !== "tool_result" || !block.tool_use_id) continue;
      const output = redact(typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""));
      events.push(
        block.is_error
          ? { type: "node.failed", id: block.tool_use_id, error: output, ts }
          : { type: "node.completed", id: block.tool_use_id, outputPreview: output, ts },
      );
      this.lastId = block.tool_use_id;
    }
    return events;
  }
}

export async function* emitTraceFromQuery<T>(
  query: AsyncIterable<T>,
  options: { runId: string; prompt: string; writeTrace: WriteTrace },
): AsyncGenerator<T> {
  const adapter = new MiniAdapter(options.runId, options.prompt);
  for await (const message of query) {
    for (const event of adapter.ingest(message)) {
      await options.writeTrace({ kind: TRACE_MESSAGE_KIND, payload: event });
    }
    yield message;
  }
}
