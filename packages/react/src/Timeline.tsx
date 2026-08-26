import { KindKicker } from "./KindKicker.js";
import { runClock } from "./clockAxis.js";
import { type KindFilter } from "./layout.js";
import { timelineMarks, formatDuration } from "./timelineMarks.js";
import { useTraceStore } from "./store.js";
import { formatUsageCompact } from "./usage.js";

function isFilteredKind(kind: string, filter: KindFilter): boolean {
  if (kind !== "tool" && kind !== "skill" && kind !== "mcp" && kind !== "subagent") {
    return false;
  }
  return filter[kind] === false;
}

export function Timeline() {
  const nodes = useTraceStore((state) => state.nodes);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const hoveredNodeId = useTraceStore((state) => state.hoveredNodeId);
  const kindFilter = useTraceStore((state) => state.kindFilter);
  const select = useTraceStore((state) => state.select);
  const hover = useTraceStore((state) => state.hover);
  const startedAt = useTraceStore((state) => state.startedAt);
  const completedAt = useTraceStore((state) => state.completedAt);
  const status = useTraceStore((state) => state.status);
  const runUsage = useTraceStore((state) => state.usage);
  const clock = runClock({ startedAt, completedAt, status, nodes });
  const compact = runUsage ? formatUsageCompact(runUsage) : undefined;
  const showTotals = nodes.length > 0;

  return (
    <div className="atc-timeline" role="list">
      {timelineMarks(nodes).map((mark, index) => {
        if (mark.type === "gap") {
          return (
            <span key={`gap-${index}`} className="atc-gap" aria-hidden="true">
              {mark.label}
            </span>
          );
        }
        const stepUsage = formatUsageCompact(mark.node.usage ?? {});
        const filteredOut = isFilteredKind(mark.node.kind, kindFilter);
        return (
          <button
            key={mark.node.id}
            type="button"
            aria-label={`${mark.node.title}, ${mark.durationLabel}`}
            aria-current={selectedNodeId === mark.node.id ? "step" : undefined}
            className={[
              "atc-span",
              `atc-span--${mark.node.kind}`,
              `is-${mark.node.status}`,
              selectedNodeId === mark.node.id ? "is-active" : "",
              hoveredNodeId === mark.node.id ? "is-hovered" : "",
              filteredOut ? "is-filtered-out" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => hover(mark.node.id)}
            onMouseLeave={() => hover(undefined)}
            onClick={() => select(mark.node.id)}
          >
            <KindKicker kind={mark.node.kind} short />
            <b>{mark.node.title}</b>
            <span className="atc-span-time">{mark.durationLabel}</span>
            {stepUsage ? <span className="atc-span-usage">{stepUsage}</span> : null}
          </button>
        );
      })}
      {showTotals ? (
        <div className="atc-run-totals" aria-label="Run totals">
          <strong>{formatDuration(clock.elapsedMs)} total</strong>
          {compact ? <span>{compact}</span> : <span>— tok</span>}
        </div>
      ) : null}
    </div>
  );
}
