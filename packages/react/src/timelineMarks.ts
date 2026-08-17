import type { TraceNode } from "../../core/src/index.js";

export type TimelineSpanMark = {
  type: "span";
  node: TraceNode;
  durationLabel: string;
};

export type TimelineGapMark = {
  type: "gap";
  ms: number;
  label: string;
};

export type TimelineMark = TimelineSpanMark | TimelineGapMark;

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
}

export function nodeDurationMs(node: TraceNode): number | undefined {
  if (typeof node.durationMs === "number") return node.durationMs;
  if (typeof node.completedAt === "number") {
    return Math.max(0, node.completedAt - node.startedAt);
  }
  return undefined;
}

export function timelineMarks(nodes: readonly TraceNode[]): TimelineMark[] {
  const marks: TimelineMark[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const duration = nodeDurationMs(node);
    marks.push({
      type: "span",
      node,
      durationLabel: duration === undefined ? "…" : formatDuration(duration),
    });
    const next = nodes[i + 1];
    if (!next) continue;
    const from = node.completedAt ?? node.startedAt;
    const gap = next.startedAt - from;
    if (gap > 0) {
      marks.push({ type: "gap", ms: gap, label: `+${formatDuration(gap)}` });
    }
  }
  return marks;
}
