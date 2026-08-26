import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import type { TraceEdge, TraceNode } from "../../core/src/index.js";

const elk = new ELK();

const WIDTH = 240;
const HEIGHT: Record<string, number> = {
  thinking: 140,
  skill: 124,
  answer: 132,
  result: 132,
  user: 108,
};

export type KindFilter = {
  tool: boolean;
  skill: boolean;
  mcp: boolean;
  subagent: boolean;
};

export const ALL_KIND_FILTER: KindFilter = {
  tool: true,
  skill: true,
  mcp: true,
  subagent: true,
};

export function filterTraceGraph(
  nodes: TraceNode[],
  edges: TraceEdge[],
  filter: KindFilter,
): { nodes: TraceNode[]; edges: TraceEdge[] } {
  const visible = new Set(
    nodes
      .filter((node) => {
        if (node.kind === "tool" || node.kind === "skill" || node.kind === "mcp" || node.kind === "subagent") {
          return filter[node.kind];
        }
        return true;
      })
      .map((node) => node.id),
  );
  return {
    nodes: nodes.filter((node) => visible.has(node.id)),
    edges: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  };
}

export function countKinds(nodes: TraceNode[]): Record<keyof KindFilter, number> {
  const counts = { tool: 0, skill: 0, mcp: 0, subagent: 0 };
  for (const node of nodes) {
    if (node.kind === "tool" || node.kind === "skill" || node.kind === "mcp" || node.kind === "subagent") {
      counts[node.kind] += 1;
    }
  }
  return counts;
}

export function neighborhoodIds(nodeId: string, edges: TraceEdge[]): Set<string> {
  const ids = new Set<string>([nodeId]);
  for (const edge of edges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  }
  return ids;
}

export type EdgeSpotlight = "related" | "dimmed" | "idle";

export function edgeSpotlight(
  edge: TraceEdge,
  focusId: string | undefined,
): EdgeSpotlight {
  if (!focusId) return "idle";
  if (edge.source === focusId || edge.target === focusId) return "related";
  return "dimmed";
}

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
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
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
