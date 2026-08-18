import type { NodeKind, TraceNode, TraceState } from "../../core/src/index.js";
import { formatDuration } from "./timelineMarks.js";

export type ClockTick = {
  id: string;
  title: string;
  kind: NodeKind;
  offsetMs: number;
  offsetLabel: string;
  pct: number;
};

export type RunClockModel = {
  originMs: number;
  elapsedMs: number;
  done: boolean;
  totalLabel?: string;
  ticks: ClockTick[];
};

function maxTime(state: Pick<TraceState, "startedAt" | "completedAt" | "nodes">): number {
  const times = [
    state.startedAt,
    state.completedAt,
    ...state.nodes.flatMap((node) => [node.startedAt, node.completedAt]),
  ].filter((value): value is number => typeof value === "number");
  return times.length ? Math.max(...times) : 0;
}

export function offsetLabel(offsetMs: number): string {
  const label = formatDuration(Math.max(0, offsetMs));
  return offsetMs === 0 ? label : `+${label}`;
}

export function runClock(
  state: Pick<TraceState, "startedAt" | "completedAt" | "status" | "nodes">,
): RunClockModel {
  const originMs = state.startedAt ?? state.nodes[0]?.startedAt ?? 0;
  const elapsedMs = Math.max(0, maxTime(state) - originMs);
  const done = state.status === "completed" || state.status === "failed";
  const span = elapsedMs || 1;

  const ticks: ClockTick[] = state.nodes.map((node: TraceNode) => {
    const offsetMs = Math.max(0, node.startedAt - originMs);
    return {
      id: node.id,
      title: node.title,
      kind: node.kind,
      offsetMs,
      offsetLabel: offsetLabel(offsetMs),
      pct: (offsetMs / span) * 100,
    };
  });

  return {
    originMs,
    elapsedMs,
    done,
    totalLabel: done ? `${formatDuration(elapsedMs)} total` : undefined,
    ticks,
  };
}
