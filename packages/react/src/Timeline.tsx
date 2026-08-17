import { KindKicker } from "./KindKicker.js";
import { timelineMarks } from "./timelineMarks.js";
import { useTraceStore } from "./store.js";

export function Timeline() {
  const nodes = useTraceStore((state) => state.nodes);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const select = useTraceStore((state) => state.select);

  return (
    <div className="atc-timeline" role="list">
      {timelineMarks(nodes).map((mark, index) =>
        mark.type === "gap" ? (
          <span key={`gap-${index}`} className="atc-gap" aria-hidden="true">
            {mark.label}
          </span>
        ) : (
          <button
            key={mark.node.id}
            type="button"
            className={`atc-span is-${mark.node.status}${selectedNodeId === mark.node.id ? " is-active" : ""}`}
            onClick={() => select(mark.node.id)}
          >
            <KindKicker kind={mark.node.kind} short />
            <b>{mark.node.title}</b>
            <span className="atc-span-time">{mark.durationLabel}</span>
          </button>
        ),
      )}
    </div>
  );
}
