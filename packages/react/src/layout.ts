import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import type { TraceEdge, TraceNode } from "../../core/src/index.js";

const elk = new ELK();

const WIDTH = 240;
const HEIGHT: Record<string, number> = {
  thinking: 128,
  skill: 112,
  answer: 120,
  result: 120,
  user: 96,
};

export async function layoutTraceGraph(
  nodes: TraceNode[],
  edges: TraceEdge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "42",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      "elk.edgeRouting": "SPLINES",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: WIDTH,
      height: HEIGHT[node.kind] ?? 100,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layout = await elk.layout(graph);
  const positions = new Map(
    (layout.children ?? []).map((child) => [
      child.id,
      { x: child.x ?? 0, y: child.y ?? 0 },
    ]),
  );

  return {
    nodes: nodes.map((node, index) => ({
      id: node.id,
      type: "trace",
      position: positions.get(node.id) ?? { x: index * 280, y: 0 },
      data: { node },
      selected: false,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "phosphor",
    })),
  };
}
