import { initialTraceState, reduceTrace, type NodeStatus, type TraceNode } from "./index.js";
import type { AgentTraceEvent, CanonicalOperation, NodeKind, TraceUsage } from "../../protocol/src/index.js";
import { fingerprint, normalizeInputShape, normalizeOperation } from "./fingerprint.js";
export type { CanonicalOperation } from "../../protocol/src/index.js";
export const ANALYZER_VERSION = 2;
export interface AnalyzedStep {
  nodeId: string; ordinal: number; parentOrdinal?: number; turnOrdinal: number;
  kind: NodeKind; operation: CanonicalOperation; inputShape: unknown;
  fingerprintVersion: 1; fingerprint: string; status: NodeStatus;
  error?: string; durationMs?: number; costUsd?: number; outputClass?: string; usage?: TraceUsage;
  identitySource: "captured" | "legacy-unknown" | "structural";
}
export interface RunAnalysis { analyzerVersion: number; fingerprintVersion: 1; steps: AnalyzedStep[]; warnings: string[] }
function parsedInput(node: TraceNode): unknown {
  if (!node.input) return null;
  try { return JSON.parse(node.input); } catch { return {unparsed:node.input}; }
}
export function analyzeRun(events: readonly AgentTraceEvent[], analyzerVersion = ANALYZER_VERSION): RunAnalysis {
  // Reduce the complete run before inspecting any input. Preserve turns if a provider
  // emits another run.started rather than node.started(kind=user).
  let state = initialTraceState;
  const nodes: TraceNode[] = [];
  for (const event of events) {
    if (event.type === "run.started" && state.nodes.length) { nodes.push(...state.nodes); state = initialTraceState; }
    state = reduceTrace(state,event);
  }
  nodes.push(...state.nodes);
  let turn = 0;
  const ordinals = new Map<string,number>();
  const steps = nodes.map((node,ordinal): AnalyzedStep => {
    if (node.kind === "user") turn++;
    const parentOrdinal = node.parentId ? ordinals.get(node.parentId) : undefined;
    ordinals.set(node.id,ordinal);
    const tool = ["tool","mcp","skill","subagent"].includes(node.kind);
    const operation = node.operation ?? {name: tool ? "unknown" : node.kind};
    const inputShape = normalizeInputShape(parsedInput(node));
    return {nodeId:node.id,ordinal,parentOrdinal,turnOrdinal:turn,kind:node.kind,
      operation:{...normalizeOperation(operation),...(operation.providerName ? {providerName:operation.providerName}:{})}, inputShape,
      fingerprintVersion:1,fingerprint:fingerprint(node.kind,operation,inputShape),status:node.status,
      durationMs:node.durationMs ?? (node.completedAt === undefined ? undefined : Math.max(0,node.completedAt-node.startedAt)),
      costUsd:node.usage?.costUsd,usage:node.usage,error:node.error,
      outputClass:node.error ? "error" : node.outputPreview === undefined ? undefined : !node.outputPreview.trim() ? "empty" : (()=>{try {const v=JSON.parse(node.outputPreview!);return Array.isArray(v)?"json-array":v===null?"null":typeof v === "object"?"json-object":typeof v;}catch{return "text";}})(),
      identitySource:node.operation ? "captured" : tool ? "legacy-unknown" : "structural"};
  });
  return {analyzerVersion,fingerprintVersion:1,steps,warnings:[...(steps.some(s=>s.identitySource==="legacy-unknown") ? ["Some steps lack captured operation identity; legacy matches are uncertain."] : []),...(steps.some(s=>s.status==="running") ? ["Some steps are still running; compare again after the run finishes."] : [])]};
}
