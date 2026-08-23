import { KindKicker } from "./KindKicker.js";
import { runClock } from "./clockAxis.js";
import { timelineMarks, formatDuration } from "./timelineMarks.js";
import { useTraceStore } from "./store.js";
import { formatUsageCompact } from "./usage.js";

export function Timeline() {
  const nodes = useTraceStore((state) => state.nodes);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const select = useTraceStore((state) => state.select);
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
        return (
          <button
            key={mark.node.id}
            type="button"
            className={`atc-span atc-span--${mark.node.kind} is-${mark.node.status}${selectedNodeId === mark.node.id ? " is-active" : ""}`}
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
