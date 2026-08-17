import type { TraceUsage } from "../../protocol/src/index.js";
import { KindKicker } from "./KindKicker.js";
import { useSelectedNode, useTraceStore } from "./store.js";
import { formatUsageDetail } from "./usage.js";

function UsageFields({ usage }: { usage?: TraceUsage }) {
  if (!usage) return null;
  const detail = formatUsageDetail(usage);
  return (
    <>
      {detail.tokens ? (
        <div>
          <dt>Tokens</dt>
          <dd>{detail.tokens}</dd>
        </div>
      ) : null}
      {detail.cache ? (
        <div>
          <dt>Cache</dt>
          <dd>{detail.cache}</dd>
        </div>
      ) : null}
      {detail.cost ? (
        <div>
          <dt>Cost</dt>
          <dd>{detail.cost}</dd>
        </div>
      ) : null}
    </>
  );
}

export function Inspector() {
  const node = useSelectedNode();
  const runUsage = useTraceStore((state) => state.usage);

  if (!node) {
    const detail = runUsage ? formatUsageDetail(runUsage) : {};
    const hasUsage = Boolean(detail.tokens || detail.cache || detail.cost);
    return (
      <aside className="atc-inspector">
        <span className="atc-kicker">Inspector</span>
        <p className="atc-empty">Select a step on the canvas or the tape to see why it ran.</p>
        {hasUsage ? (
          <dl className="atc-spec">
            <UsageFields usage={runUsage} />
          </dl>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="atc-inspector">
      <KindKicker kind={node.kind} />
      <h2>{node.title}</h2>
      <dl className="atc-spec">
        <div>
          <dt>Why</dt>
          <dd>{node.reason || node.text || "This step ran as part of the agent turn."}</dd>
        </div>
        {node.input ? (
          <div>
            <dt>Input</dt>
            <dd>
              <pre>{node.input}</pre>
            </dd>
          </div>
        ) : null}
        {node.outputPreview ? (
          <div>
            <dt>Output</dt>
            <dd>
              <pre>{node.outputPreview}</pre>
            </dd>
          </div>
        ) : null}
        {node.error ? (
          <div>
            <dt>Error</dt>
            <dd>{node.error}</dd>
          </div>
        ) : null}
        {typeof node.durationMs === "number" ? (
          <div>
            <dt>Duration</dt>
            <dd>{node.durationMs} ms</dd>
          </div>
        ) : null}
        <UsageFields usage={node.usage} />
      </dl>
    </aside>
  );
}
