import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { chronologicalNumbers } from "../../core/src/index.js";
import { CanvasZoomControls } from "./CanvasZoomControls.js";
import {
  ALL_KIND_FILTER,
  filterTraceGraph,
  layoutTraceGraph,
  neighborhoodIds,
  type KindFilter,
} from "./layout.js";
import { PhosphorEdge } from "./PhosphorEdge.js";
import { TraceNodeView } from "./TraceNodeView.js";
import { useTraceStore } from "./store.js";

const nodeTypes: NodeTypes = { trace: TraceNodeView };
const edgeTypes: EdgeTypes = { phosphor: PhosphorEdge };

const FILTERS: Array<{ key: keyof KindFilter; label: string }> = [
  { key: "subagent", label: "Agents" },
  { key: "tool", label: "Tools" },
  { key: "skill", label: "Skills" },
  { key: "mcp", label: "MCPs" },
];

function CanvasInner() {
  const nodes = useTraceStore((state) => state.nodes);
  const edges = useTraceStore((state) => state.edges);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const hoveredNodeId = useTraceStore((state) => state.hoveredNodeId);
  const select = useTraceStore((state) => state.select);
  const hover = useTraceStore((state) => state.hover);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [filter, setFilter] = useState<KindFilter>(ALL_KIND_FILTER);
  const [graph, setGraph] = useState({ nodes: [], edges: [] } as Awaited<
    ReturnType<typeof layoutTraceGraph>
  >);
  const visible = useMemo(() => filterTraceGraph(nodes, edges, filter), [nodes, edges, filter]);
  const numbers = useMemo(() => chronologicalNumbers(nodes), [nodes]);

  const topologyKey = `${visible.nodes.length}:${visible.edges.length}:${FILTERS.map((item) => filter[item.key]).join("")}`;

  useEffect(() => {
    let cancelled = false;
    void layoutTraceGraph(visible.nodes, visible.edges).then((next) => {
      if (cancelled) return;
      setGraph({
        nodes: next.nodes,
        edges: next.edges,
      });
      requestAnimationFrame(() => {
        void fitView({ padding: 0.18, duration: 280 });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [topologyKey, visible.nodes, visible.edges, fitView]);

  const focusId = hoveredNodeId ?? selectedNodeId;
  const neighbors = useMemo(
    () => (focusId ? neighborhoodIds(focusId, edges) : new Set<string>()),
    [focusId, edges],
  );

  const flowNodes = useMemo(
    () =>
      graph.nodes.map((node) => {
        const hovered = node.id === hoveredNodeId;
        const dimmed = Boolean(focusId) && !neighbors.has(node.id);
        return {
          ...node,
          selected: node.id === selectedNodeId,
          className: [hovered ? "is-hovered" : "", dimmed ? "is-dimmed" : ""].filter(Boolean).join(" "),
          data: {
            node: nodes.find((item) => item.id === node.id) ?? node.data.node,
            order: numbers.get(node.id),
            hovered,
            dimmed,
            hover,
          },
        };
      }),
    [graph.nodes, nodes, numbers, selectedNodeId, hoveredNodeId, focusId, neighbors, hover],
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => select(node.id)}
      onPaneClick={() => select(undefined)}
      onNodeMouseEnter={(_, node) => hover(node.id)}
      onNodeMouseLeave={() => hover(undefined)}
      fitView
      minZoom={0.25}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      panOnScroll
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={22} size={1} color="rgba(92, 86, 76, 0.28)" />
      <Panel position="top-left" className="atc-kind-filter">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`atc-kind-chip atc-kind-chip--${item.key}`}
            aria-pressed={filter[item.key]}
            onClick={() => setFilter((current) => ({ ...current, [item.key]: !current[item.key] }))}
          >
            {item.label}
          </button>
        ))}
      </Panel>
      <Panel position="bottom-left" className="atc-zoom-panel">
        <CanvasZoomControls
          onZoomIn={() => {
            void zoomIn();
          }}
          onZoomOut={() => {
            void zoomOut();
          }}
        />
      </Panel>
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
