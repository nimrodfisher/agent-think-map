import type { AgentTraceEvent } from "../../protocol/src/index.js";

/** Shared normalization for queries and documents; punctuation separates operation names. */
export function normalizeSearch(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
export const SEARCH_EVENT_TYPES = ["node.started", "node.completed", "node.failed"];
/** Each field has a budget. Never consume deltas, tool input, or extension/raw content. */
export function buildSearchDocument(run: { prompt: string; model?: string; label?: string }, events: Iterable<AgentTraceEvent>): string {
  let operations = "", previews = "", errors = "";
  for (const event of events) {
    if (event.type === "node.started" && ["tool", "mcp", "skill", "subagent"].includes(event.kind)) operations = (operations + " " + event.title.slice(0, 256)).slice(0, 8192);
    if (event.type === "node.completed") previews = (previews + " " + (event.outputPreview ?? "").slice(0, 1024)).slice(0, 8192);
    if (event.type === "node.failed") errors = (errors + " " + event.error.slice(0, 1024)).slice(0, 8192);
  }
  return normalizeSearch([run.prompt.slice(0, 4096), run.model?.slice(0, 256), run.label, operations, previews, errors].join(" "));
}
