import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import type { TraceNode } from "../../core/src/index.js";
import { KindKicker } from "./KindKicker.js";

export function TraceNodeView({ data, selected }: NodeProps) {
  const node = data.node as TraceNode;
  const preview = node.reason || node.text || node.outputPreview || node.error || "";

  return (
    <motion.article
      className={`atc-node atc-node--${node.kind} is-${node.status}${selected ? " is-selected" : ""}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Handle type="target" position={Position.Left} />
      <header>
        <KindKicker kind={node.kind} />
        <span className="atc-pulse" aria-hidden="true" />
      </header>
      <h3>{node.title}</h3>
      {preview ? <p>{preview}</p> : null}
      <Handle type="source" position={Position.Right} />
    </motion.article>
  );
}
