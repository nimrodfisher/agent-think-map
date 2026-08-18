import { KindKicker } from "./KindKicker.js";
import { runClock } from "./clockAxis.js";
import { useTraceStore } from "./store.js";

export function RunClock() {
  const startedAt = useTraceStore((state) => state.startedAt);
  const completedAt = useTraceStore((state) => state.completedAt);
  const status = useTraceStore((state) => state.status);
  const nodes = useTraceStore((state) => state.nodes);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const select = useTraceStore((state) => state.select);
  const clock = runClock({ startedAt, completedAt, status, nodes });

  if (clock.ticks.length === 0) return null;

  return (
    <div className="atc-clock">
      <div className="atc-clock-track" role="list" aria-label="Run clock">
        {clock.ticks.map((tick) => (
          <button
            key={tick.id}
            type="button"
            role="listitem"
            className={`atc-clock-tick${selectedNodeId === tick.id ? " is-active" : ""}`}
            style={{ left: `${tick.pct}%` }}
            title={`${tick.title} ${tick.offsetLabel}`}
            onClick={() => select(tick.id)}
          >
            <span className="atc-clock-mark" aria-hidden="true" />
            <KindKicker kind={tick.kind} short />
            <b>{tick.title}</b>
            <span className="atc-clock-offset">{tick.offsetLabel}</span>
          </button>
        ))}
        {clock.totalLabel ? (
          <span className="atc-clock-total">{clock.totalLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
