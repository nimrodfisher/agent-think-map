import type { TraceUsage } from "../../protocol/src/index.js";
import { useState } from "react";
import { KindKicker } from "./KindKicker.js";
import { prettifyJson, prettifyToolInput } from "./sql.js";
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

function PrettyField({ label, text }: { label: string; text: string }) {
  const sql = prettifyToolInput(text);
  const json = prettifyJson(text);
  const [view, setView] = useState<"raw" | "sql" | "json">(() =>
    sql.hasSql ? "sql" : json ? "json" : "raw",
  );
  const shown =
    view === "sql" && sql.hasSql ? sql.pretty : view === "json" && json ? json : text;
  return (
    <div>
      <dt>
        <span className="atc-pretty-actions">
          {sql.hasSql ? (
            <button
              type="button"
              className="atc-sql-toggle"
              onClick={() => setView((current) => (current === "sql" ? "raw" : "sql"))}
            >
              {view === "sql" ? "Raw JSON" : "Prettify SQL"}
            </button>
          ) : null}
          {json ? (
            <button
              type="button"
              className="atc-sql-toggle"
              onClick={() => setView((current) => (current === "json" ? "raw" : "json"))}
            >
              {view === "json" ? "Raw JSON" : "Pretty JSON"}
            </button>
          ) : null}
        </span>
        {label}
      </dt>
      <dd>
        <pre>{shown}</pre>
      </dd>
    </div>
  );
}

export function Inspector() {
  const node = useSelectedNode();
  const runUsage = useTraceStore((state) => state.usage);
  const model = useTraceStore((state) => state.model);
  const effort = useTraceStore((state) => state.effort);

  if (!node) {
    const detail = runUsage ? formatUsageDetail(runUsage) : {};
    const hasUsage = Boolean(detail.tokens || detail.cache || detail.cost);
    return (
      <aside className="atc-inspector">
        <span className="atc-kicker">Inspector</span>
        <p className="atc-empty">Select a step on the canvas or the tape to see why it ran.</p>
        {model || effort || hasUsage ? (
          <dl className="atc-spec">
            {model ? (
              <div>
                <dt>Model</dt>
                <dd>{model}</dd>
              </div>
            ) : null}
            {effort ? (
              <div>
                <dt>Effort</dt>
                <dd>{effort}</dd>
              </div>
            ) : null}
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
        {node.input ? <PrettyField key={`${node.id}-in`} label="Input" text={node.input} /> : null}
        {node.outputPreview ? (
          <PrettyField key={`${node.id}-out`} label="Output" text={node.outputPreview} />
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
