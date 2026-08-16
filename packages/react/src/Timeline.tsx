import { useTraceStore } from "./store.js";

const KIND_LABEL: Record<string, string> = {
  user: "Prompt",
  thinking: "Think",
  skill: "Skill",
  mcp: "MCP",
  tool: "Tool",
  subagent: "Sub",
  result: "Out",
  answer: "Answer",
};

export function Timeline() {
  const nodes = useTraceStore((state) => state.nodes);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const select = useTraceStore((state) => state.select);

  return (
    <div className="atc-timeline" role="list">
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          className={`atc-span is-${node.status}${selectedNodeId === node.id ? " is-active" : ""}`}
          onClick={() => select(node.id)}
        >
          <span className="atc-kicker">{KIND_LABEL[node.kind] ?? node.kind}</span>
          <b>{node.title}</b>
        </button>
      ))}
    </div>
  );
}
