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
  countKinds,
  edgeSpotlight,
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

function isFilteredKind(kind: string, filter: KindFilter): boolean {
  if (kind !== "tool" && kind !== "skill" && kind !== "mcp" && kind !== "subagent") {
    return false;
  }
  return filter[kind] === false;
}

function CanvasInner() {
  const nodes = useTraceStore((state) => state.nodes);
  const edges = useTraceStore((state) => state.edges);
  const selectedNodeId = useTraceStore((state) => state.selectedNodeId);
  const hoveredNodeId = useTraceStore((state) => state.hoveredNodeId);
  const kindFilter = useTraceStore((state) => state.kindFilter);
  const select = useTraceStore((state) => state.select);
  const hover = useTraceStore((state) => state.hover);
  const setKindFilter = useTraceStore((state) => state.setKindFilter);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [graph, setGraph] = useState({ nodes: [], edges: [] } as Awaited<
    ReturnType<typeof layoutTraceGraph>
  >);
  const numbers = useMemo(() => chronologicalNumbers(nodes), [nodes]);
  const counts = useMemo(() => countKinds(nodes), [nodes]);

  const topologyKey = `${nodes.length}:${nodes.map((node) => node.id).join("\0")}:${edges.map((edge) => edge.id).join("\0")}`;

  // Layout once per node/edge identity, not payload (delta/status) or kindFilter.
  useEffect(() => {
    let cancelled = false;
    void layoutTraceGraph(nodes, edges).then((next) => {
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
  }, [topologyKey, fitView]);

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
        const traceNode = nodes.find((item) => item.id === node.id) ?? node.data.node;
        const filteredOut = isFilteredKind(traceNode.kind, kindFilter);
        return {
          ...node,
          selected: node.id === selectedNodeId,
          className: [
            hovered ? "is-hovered" : "",
            dimmed ? "is-dimmed" : "",
            filteredOut ? "is-filtered-out" : "",
          ]
            .filter(Boolean)
            .join(" "),
          data: {
            node: traceNode,
            order: numbers.get(node.id),
            hovered,
            dimmed,
            filteredOut,
            hover,
          },
        };
      }),
    [graph.nodes, nodes, numbers, selectedNodeId, hoveredNodeId, focusId, neighbors, hover, kindFilter],
  );

  const flowEdges = useMemo(
    () =>
      graph.edges.map((edge) => {
        const spotlight = edgeSpotlight(
          { id: edge.id, source: edge.source, target: edge.target },
          focusId,
        );
        const sourceNode = nodes.find((item) => item.id === edge.source);
        const targetNode = nodes.find((item) => item.id === edge.target);
        const running = targetNode?.status === "running";
        const filteredOut =
          isFilteredKind(sourceNode?.kind ?? "", kindFilter) ||
          isFilteredKind(targetNode?.kind ?? "", kindFilter);
        return {
          ...edge,
          className: [
            `is-${spotlight}`,
            running ? "is-running" : "",
            filteredOut ? "is-filtered-out" : "",
          ]
            .filter(Boolean)
            .join(" "),
          data: { spotlight, running, filteredOut },
        };
      }),
    [graph.edges, focusId, nodes, kindFilter],
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
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
            aria-pressed={kindFilter[item.key]}
            onClick={() =>
              setKindFilter((current) => ({ ...current, [item.key]: !current[item.key] }))
            }
          >
            {item.label}
            <span className="atc-kind-count">{counts[item.key]}</span>
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
          onFit={() => {
            const reduce =
              window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
            void fitView({ padding: 0.18, duration: reduce ? 0 : 280 });
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
