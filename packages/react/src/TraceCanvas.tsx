import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutTraceGraph } from "./layout.js";
import { PhosphorEdge } from "./PhosphorEdge.js";
import { TraceNodeView } from "./TraceNodeView.js";
import { useTraceStore } from "./store.js";

const nodeTypes: NodeTypes = { trace: TraceNodeView };
const edgeTypes: EdgeTypes = { phosphor: PhosphorEdge };

function CanvasInner() {
  const nodes = useTraceStore((state) => state.nodes);
  const edges = useTraceStore((state) => state.edges);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const select = useTraceStore((state) => state.select);
  const { fitView } = useReactFlow();
  const [graph, setGraph] = useState({ nodes: [], edges: [] } as Awaited<
    ReturnType<typeof layoutTraceGraph>
  >);

  const topologyKey = `${nodes.length}:${edges.length}`;

  useEffect(() => {
    let cancelled = false;
    void layoutTraceGraph(nodes, edges).then((next) => {
      if (cancelled) return;
      setGraph({
        nodes: next.nodes.map((node) => ({
          ...node,
          selected: node.id === selectedNodeId,
        })),
        edges: next.edges,
      });
      requestAnimationFrame(() => {
        void fitView({ padding: 0.18, duration: 280 });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [topologyKey, nodes, edges, selectedNodeId, fitView]);

  const flowNodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        data: {
          node: nodes.find((item) => item.id === node.id) ?? node.data.node,
        },
      })),
    [graph.nodes, nodes, selectedNodeId],
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => select(node.id)}
      onPaneClick={() => select(undefined)}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      panOnScroll
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={22} size={1} color="rgba(92, 86, 76, 0.28)" />
    </ReactFlow>
  );
}

export function TraceCanvas() {
  return (
    <div className="atc-canvas">
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
