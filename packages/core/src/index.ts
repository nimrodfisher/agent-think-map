import type { AgentTraceEvent, NodeKind, TraceUsage } from "../../protocol/src/index.js";

// Re-exported so sibling packages (react/clockAxis.ts) can name the kind of a
// node without reaching past core into protocol.
export type { NodeKind } from "../../protocol/src/index.js";

export type NodeStatus = "running" | "completed" | "failed";
export type RunStatus = "idle" | "running" | "completed" | "failed";

export interface TraceNode {
  id: string;
  kind: NodeKind;
  title: string;
  parentId?: string;
  reason?: string;
  text: string;
  input?: string;
  outputPreview?: string;
  error?: string;
  status: NodeStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  usage?: TraceUsage;
}

export interface TraceEdge {
  id: string;
  source: string;
  target: string;
}

export interface TraceState {
  runId?: string;
  prompt?: string;
  status: RunStatus;
  startedAt?: number;
  completedAt?: number;
  nodes: TraceNode[];
  edges: TraceEdge[];
  selectedNodeId?: string;
  activeNodeId?: string;
  usage?: TraceUsage;
  model?: string;
  effort?: string;
}

export const initialTraceState: TraceState = {
  status: "idle",
  nodes: [],
  edges: [],
};

function userNodeId(runId: string): string {
  return `user-${runId}`;
}

function updateNode(
  state: TraceState,
  id: string,
  patch: Partial<TraceNode>,
): TraceState {
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === id ? { ...node, ...patch } : node,
    ),
  };
}

export function reduceTrace(
  state: TraceState,
  event: AgentTraceEvent,
): TraceState {
  switch (event.type) {
    case "run.started": {
      const id = userNodeId(event.runId);
      return {
        ...initialTraceState,
        runId: event.runId,
        prompt: event.prompt,
        status: "running",
        startedAt: event.ts,
        selectedNodeId: id,
        activeNodeId: id,
        nodes: [
          {
            id,
            kind: "user",
            title: "User",
            text: event.prompt,
            status: "completed",
            startedAt: event.ts,
            completedAt: event.ts,
          },
        ],
        edges: [],
      };
    }
    case "node.started": {
      if (state.nodes.some((node) => node.id === event.id)) {
        return state;
      }
      const parentId =
        event.parentId ?? state.nodes[state.nodes.length - 1]?.id;
      const node: TraceNode = {
        id: event.id,
        kind: event.kind,
        title: event.title,
        parentId,
        reason: event.reason,
        text: "",
        status: "running",
        startedAt: event.ts,
      };
      const edges = [...state.edges];
      if (parentId) {
        const edgeId = `${parentId}->${event.id}`;
        if (!edges.some((edge) => edge.id === edgeId)) {
          edges.push({ id: edgeId, source: parentId, target: event.id });
        }
      }
      return {
        ...state,
        nodes: [...state.nodes, node],
        edges,
        activeNodeId: event.id,
      };
    }
    case "node.delta": {
      const existing = state.nodes.find((node) => node.id === event.id);
      if (!existing) return state;
      return updateNode(state, event.id, { text: existing.text + event.text });
    }
    case "tool.input": {
      const existing = state.nodes.find((node) => node.id === event.id);
      if (!existing) return state;
      return updateNode(state, event.id, {
        input: (existing.input ?? "") + event.partial,
      });
    }
    case "node.completed": {
      const existing = state.nodes.find((node) => node.id === event.id);
      return {
        ...updateNode(state, event.id, {
          status: "completed",
          outputPreview: event.outputPreview ?? existing?.outputPreview,
          durationMs: event.durationMs ?? existing?.durationMs,
          completedAt: event.ts,
          usage: event.usage ?? existing?.usage,
        }),
        activeNodeId:
          state.activeNodeId === event.id ? undefined : state.activeNodeId,
      };
    }
    case "node.failed": {
      const existing = state.nodes.find((node) => node.id === event.id);
      return {
        ...updateNode(state, event.id, {
          status: "failed",
          error: event.error,
          completedAt: event.ts,
          usage: event.usage ?? existing?.usage,
        }),
        status: "failed",
        activeNodeId:
          state.activeNodeId === event.id ? undefined : state.activeNodeId,
      };
    }
    case "run.completed": {
      let nodes = state.nodes;
      if (event.usage) {
        const answer = [...nodes].reverse().find((node) => node.kind === "answer");
        if (answer && !answer.usage) {
          nodes = nodes.map((node) =>
            node.id === answer.id ? { ...node, usage: event.usage } : node,
          );
        }
      }
      return {
        ...state,
        nodes,
        status: state.status === "failed" ? "failed" : "completed",
        completedAt: event.ts,
        activeNodeId: undefined,
        usage: event.usage ?? state.usage,
      };
    }
    case "run.meta": {
      return {
        ...state,
        model: event.model ?? state.model,
        effort: event.effort ?? state.effort,
        usage: event.usage ?? state.usage,
      };
    }
    default: {
      return state;
    }
  }
}

export function reduceTraceAll(events: readonly AgentTraceEvent[]): TraceState {
  return events.reduce(reduceTrace, initialTraceState);
}

export interface ClassifiedTool {
  kind: Extract<NodeKind, "skill" | "mcp" | "tool" | "subagent">;
  title: string;
  server?: string;
  tool?: string;
}

const SKILL_FILE_TOOLS = new Set(["Read", "Grep", "Glob"]);
const SKILL_DIR_RE = /(?:^|[/\\])\.claude[/\\]skills[/\\]([^/\\]+)/;

export function parseToolInput(input: string): Record<string, unknown> | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function asToolInputRecord(
  input?: Record<string, unknown> | string,
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  return typeof input === "string" ? parseToolInput(input) : input;
}

function skillNameFromPathInput(input: Record<string, unknown>): string | undefined {
  for (const key of ["file_path", "path", "pattern"] as const) {
    const value = input[key];
    if (typeof value !== "string" || !value) continue;
    const name = value.match(SKILL_DIR_RE)?.[1];
    if (name && !/[*?[\]]/.test(name)) return name;
  }
  return undefined;
}

export function classifyToolName(
  name: string,
  input?: Record<string, unknown> | string,
): ClassifiedTool {
  if (name === "Skill" || name.toLowerCase() === "skill") {
    return { kind: "skill", title: name };
  }
  if (name === "Task") {
    return { kind: "subagent", title: "Task" };
  }
  if (name.startsWith("mcp__")) {
    const [, server = "unknown", ...rest] = name.split("__");
    const tool = rest.join("__") || name;
    return {
      kind: "mcp",
      title: `${server} / ${tool}`,
      server,
      tool,
    };
  }
  if (name === "Bash" || name === "bash") {
    const parsed = asToolInputRecord(input);
    const command = typeof parsed?.command === "string" ? parsed.command.trim() : "";
    const title = command.split(/\s+/)[0] || "Bash";
    return { kind: "tool", title };
  }
  if (SKILL_FILE_TOOLS.has(name)) {
    const parsed = asToolInputRecord(input);
    const skill = parsed ? skillNameFromPathInput(parsed) : undefined;
    if (skill) return { kind: "skill", title: skill };
  }
  return { kind: "tool", title: name };
}

export interface ReasonInput {
  kind: NodeKind;
  title: string;
  server?: string;
  tool?: string;
  inputSummary?: string;
}

export function reasonFor(input: ReasonInput): string {
  if (input.kind === "skill") {
    return `Loaded ${input.title} because the task matched that skill`;
  }
  if (input.kind === "mcp") {
    const tool = input.tool ?? input.title;
    const server = input.server ?? "mcp";
    return `Called ${tool} on server ${server}`;
  }
  if (input.inputSummary) {
    return `Used ${input.title} on ${input.inputSummary}`;
  }
  return `Used ${input.title}`;
}

const SECRET_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\bsk-[A-Za-z0-9]{16,}/g,
  /\bghp_[A-Za-z0-9]{8,}/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
  /\bBearer\s+\S+/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, "[redacted]"),
    text,
  );
}

export { githubIssueFixture } from "./fixtures/github-issue-run.js";

export function chronologicalNumbers(nodes: readonly TraceNode[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const node of nodes) {
    if (node.kind === "user") n = 0;
    n += 1;
    numbers.set(node.id, n);
  }
  return numbers;
}

export function summarizeToolInput(
  input: string,
  parsed?: Record<string, unknown>,
): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const record = parsed ?? parseToolInput(trimmed);
  if (record) {
    for (const key of ["path", "query", "url", "file_path", "command", "skill", "name"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value.length > 120 ? `${value.slice(0, 117)}...` : value;
      }
    }
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}
