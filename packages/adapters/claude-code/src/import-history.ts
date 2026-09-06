import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { classifyToolName, reasonFor, redactSecrets, summarizeToolInput } from "../../../core/src/index.js";
import type { ImportDiagnostic, ImportEvent, ImportSource, LocalHistoryImporter } from "../../../core/src/history-import.js";
import { agentTraceEventSchema, operationFromName, type AgentTraceEvent } from "../../../protocol/src/index.js";
import { modelFromTranscriptText, readTranscriptFile, resolveTranscriptPath, usageFromTranscriptText } from "./transcript.js";

export const defaultClaudeHistoryRoot = () => join(homedir(), ".claude", "projects");
const object = (value: unknown): Record<string, any> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
const string = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const preview = (value: unknown): string => redactSecrets(typeof value === "string" ? value : JSON.stringify(value) ?? "").slice(0, 8000);
function blocks(record: Record<string, any>): Record<string, any>[] {
  const content = object(record.message)?.content;
  return typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content.map(object).filter((v): v is Record<string, any> => !!v) : [];
}
const textOf = (record: Record<string, any>) => blocks(record).filter(block => block.type === "text" && typeof block.text === "string").map(block => block.text).join("\n");
const timestamp = (value: unknown) => typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
type RecordLine = { record: Record<string, any>; line: number; key: string; ts: number };

export class ClaudeCodeHistoryImporter implements LocalHistoryImporter {
  readonly provider = "claude-code" as const;
  async *discover(root: string): AsyncIterable<ImportSource | ImportDiagnostic> {
    const resolved = resolveTranscriptPath(root);
    const relativePath = (path: string) => relative(resolved, path).replaceAll("\\", "/") || ".";
    async function* walk(directory: string): AsyncIterable<ImportSource | ImportDiagnostic> {
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); }
      catch { yield { type: "diagnostic", source: relativePath(directory), code: "unreadable-directory" }; return; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "subagents") yield* walk(path);
        } else if (entry.name.endsWith(".jsonl")) {
          // Child transcripts and symlinks are not independent sessions.
          if (!entry.isFile() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i.test(entry.name)) {
            yield { type: "diagnostic", source: relativePath(path), code: "excluded-file" }; continue;
          }
          yield { path, relativePath: relativePath(path), runId: basename(entry.name, ".jsonl") };
        }
      }
    }
    yield* walk(resolved);
  }

  async *convert(source: ImportSource): AsyncIterable<ImportEvent | ImportDiagnostic> {
    const text = readTranscriptFile(source.path);
    if (text === undefined) { yield { type: "diagnostic", source: source.relativePath, code: "unreadable-file" }; return; }
    const records: RecordLine[] = [], seen = new Set<string>();
    const invalid = (line: number, code: ImportDiagnostic["code"] = "invalid-record"): ImportDiagnostic => ({ type: "diagnostic", source: source.relativePath, code, line });
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].trim()) continue;
      let value: unknown;
      try { value = JSON.parse(lines[index]); }
      catch { yield invalid(index + 1, "malformed-json"); continue; }
      const record = object(value);
      if (!record) { yield invalid(index + 1); continue; }
      const terminal = record.type === "session_end" || (record.type === "system" && record.subtype === "session_end") || record.hook_event_name === "SessionEnd";
      if (!terminal && record.type !== "user" && record.type !== "assistant") continue; // Known/unknown metadata is not a message.
      const ts = timestamp(record.timestamp);
      const session = record.sessionId ?? record.session_id;
      if (!Number.isFinite(ts) || (session !== undefined && session !== source.runId) || (!terminal && !blocks(record).length)) {
        yield invalid(index + 1); continue;
      }
      // Hash opaque UUID strings so malformed Unicode cannot throw or leak into identifiers.
      const key = string(record.uuid) ? "uuid-" + createHash("sha256").update(record.uuid).digest("hex") : "line-" + (index + 1);
      if (seen.has(key)) continue;
      seen.add(key); records.push({ record, line: index + 1, key, ts });
    }
    const firstUser = records.find(({ record }) => record.type === "user" && record.isSidechain !== true && textOf(record));
    const prefix = `import:claude-code:${source.runId}:`;
    const event = (row: RecordLine, slot: string, payload: AgentTraceEvent): ImportEvent => ({ type: "event", eventId: prefix + row.key + ":" + slot, payload });
    const nodes = new Map<string, string>(), tools = new Set<string>();
    let opened = false, spine: string | undefined, lastEmitted: RecordLine | undefined;
    for (const row of records) {
      const { record, ts } = row;
      const events: Array<{ slot: string; payload: AgentTraceEvent }> = [];
      const add = (slot: string, payload: AgentTraceEvent) => events.push({ slot, payload });
      const parent = nodes.get(record.parentUuid) ?? string(record.agentId) ?? (record.isSidechain === true ? undefined : spine);
      if (record.type === "user" || record.type === "assistant") {
        let badBlock = false;
        for (const [index, block] of blocks(record).entries()) {
          const slot = "block-" + index;
          const id = prefix + row.key + ":" + slot;
          if (block.type === "text" && typeof block.text === "string") {
            // run.started already creates the initial user node, just as live capture does.
            if (row === firstUser || !block.text) continue;
            const content = preview(block.text), kind = record.type === "user" ? "user" : "answer";
            add(slot + ":start", { type: "node.started", id, kind, title: kind === "user" ? "User" : "Answer", parentId: parent, ts });
            add(slot + ":text", { type: "node.delta", id, text: content, ts });
            add(slot + ":end", { type: "node.completed", id, outputPreview: content, ts });
            if (string(record.uuid)) nodes.set(record.uuid, id);
            if (record.isSidechain !== true) spine = id;
          } else if (block.type === "tool_use") {
            if (!string(block.id) || !string(block.name) || block.input === undefined) { badBlock = true; continue; }
            const classified = classifyToolName(block.name);
            const input = redactSecrets(JSON.stringify(block.input));
            const summary = summarizeToolInput(input);
            const title = classified.kind === "skill" ? summary ?? classified.title : classified.title;
            add(slot + ":start", { type: "node.started", id: block.id, kind: classified.kind,
              operation: operationFromName(block.name), title: preview(title), parentId: parent,
              reason: preview(reasonFor({ kind: classified.kind, title, server: classified.server, tool: classified.tool, inputSummary: summary })), ts });
            add(slot + ":input", { type: "tool.input", id: block.id, partial: input, ts });
            tools.add(block.id); if (string(record.uuid)) nodes.set(record.uuid, block.id);
          } else if (block.type === "tool_result") {
            if (!string(block.tool_use_id) || !tools.has(block.tool_use_id) || block.content === undefined) { badBlock = true; continue; }
            const output = preview(block.content);
            add(slot + ":result", block.is_error === true
              ? { type: "node.failed", id: block.tool_use_id, error: output, ts }
              : { type: "node.completed", id: block.tool_use_id, outputPreview: output, ts });
          } else if (block.type === "text") badBlock = true;
        }
        if (badBlock) yield invalid(row.line);
      } else if (opened && record.isSidechain !== true) {
        add("session-end", { type: "run.completed", runId: source.runId, ts });
      }
      if (!opened && (events.length || row === firstUser)) {
        yield event(row, "run-start", { type: "run.started", runId: source.runId, prompt: preview(firstUser ? textOf(firstUser.record) : ""), ts });
        opened = true;
        if (firstUser?.record.uuid) nodes.set(firstUser.record.uuid, "user-" + source.runId);
        spine ??= "user-" + source.runId;
      }
      for (const item of events) yield event(row, item.slot, item.payload);
      if (events.length || row === firstUser) lastEmitted = row;
    }
    if (!opened || !lastEmitted) return;
    // A growing transcript gets a new metadata boundary, without replacing earlier events.
    const metadataText = records.filter(row => row.record.isSidechain !== true).map(row => JSON.stringify(row.record)).join("\n");
    const model = modelFromTranscriptText(metadataText), usage = usageFromTranscriptText(metadataText);
    if (model || usage) {
      const payload = { type: "run.meta" as const, runId: source.runId, model: model ? preview(model) : undefined, usage, ts: lastEmitted.ts };
      if (agentTraceEventSchema.safeParse(payload).success) {
        const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
        yield event(lastEmitted, "metadata-" + digest, payload);
      } else yield invalid(lastEmitted.line);
    }
  }
}
