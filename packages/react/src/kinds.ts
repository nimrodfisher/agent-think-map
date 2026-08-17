import type { NodeKind } from "../../protocol/src/index.js";

export interface KindMeta {
  emoji: string;
  label: string;
  short: string;
}

export const KIND_META: Record<NodeKind, KindMeta> = {
  user: { emoji: "💬", label: "Prompt", short: "Prompt" },
  thinking: { emoji: "💭", label: "Thinking", short: "Think" },
  skill: { emoji: "📘", label: "Skill", short: "Skill" },
  mcp: { emoji: "🔌", label: "MCP", short: "MCP" },
  tool: { emoji: "🔧", label: "Tool", short: "Tool" },
  subagent: { emoji: "🧩", label: "Task", short: "Task" },
  result: { emoji: "📤", label: "Result", short: "Out" },
  answer: { emoji: "✅", label: "Answer", short: "Answer" },
};

export function kindMeta(kind: string): KindMeta {
  return KIND_META[kind as NodeKind] ?? { emoji: "", label: kind, short: kind };
}
