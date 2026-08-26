import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import type { TraceNode } from "../../core/src/index.js";
import { KindKicker } from "./KindKicker.js";
import { formatUsageCompact } from "./usage.js";

export function TraceNodeView({ data, selected }: NodeProps) {
  const node = data.node as TraceNode;
  const order = data.order as number | undefined;
  const hover = data.hover as ((id: string | undefined) => void) | undefined;
  const preview = node.reason || node.text || node.outputPreview || node.error || "";
  const compact = formatUsageCompact(node.usage ?? {});
  const className = [
    "atc-node",
    `atc-node--${node.kind}`,
    `is-${node.status}`,
    selected ? "is-selected" : "",
    data.hovered ? "is-hovered" : "",
    data.dimmed ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.article
      className={className}
      title={node.title}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      onMouseEnter={() => hover?.(node.id)}
      onMouseLeave={() => hover?.(undefined)}
    >
      <Handle type="target" position={Position.Left} />
      <header>
        {typeof order === "number" ? <span className="atc-node-index">{order}</span> : null}
        <KindKicker kind={node.kind} />
        <span className="atc-pulse" aria-hidden="true" />
      </header>
      <h3>{node.title}</h3>
      {preview ? <p>{preview}</p> : null}
      {compact ? <p className="atc-node-usage">{compact}</p> : null}
      <Handle type="source" position={Position.Right} />
    </motion.article>
  );
}
