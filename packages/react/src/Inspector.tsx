import { useSelectedNode } from "./store.js";

const KIND_LABEL: Record<string, string> = {
  user: "Prompt",
  thinking: "Thinking",
  skill: "Skill",
  mcp: "MCP",
  tool: "Tool",
  subagent: "Subagent",
  result: "Result",
  answer: "Answer",
};

export function Inspector() {
  const node = useSelectedNode();

  if (!node) {
    return (
      <aside className="atc-inspector">
        <span className="atc-kicker">Inspector</span>
        <p className="atc-empty">Select a step on the canvas or the tape to see why it ran.</p>
      </aside>
    );
  }

  return (
    <aside className="atc-inspector">
      <span className="atc-kicker">{KIND_LABEL[node.kind] ?? node.kind}</span>
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
      </dl>
    </aside>
  );
}
