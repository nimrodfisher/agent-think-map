# Your agent log is lying to you

Publish this as-is on [ai-analytics-hub.com](https://ai-analytics-hub.com) (canonical), then Dev.to/Hashnode with that URL as `canonical`. One post.

**Claude Code:** `npx agent-think-map claude --install`  
**Live demo (no key):** https://nimrodfisher.github.io/agent-think-map/  
**Repo:** https://github.com/nimrodfisher/agent-think-map  
**GIF:** graph growing (embed and/or Claude Code studio). Fallback: `docs/demo.gif`.

**CMS:** slug `your-agent-log-is-lying-to-you` · tags MCP, Context Engineering, Claude, Agents · ~4 min

If a Claude-only slug already went live, keep that URL as canonical and **edit the body** to the copy below. Do not publish a second competing post.

---

## TL;DR

A chat log — and a CLI transcript — show the ending. They do not show the route. When a skill loads, `Read` fires, an MCP server hops, and the answer is wrong, the UI still looks like a conversation. The bug was in the path. agent-think-map is a live canvas of that path: chain-of-thought, skills, tools, MCP, subagents. Same graph in the chat UI you already ship, or beside Claude Code. Model-agnostic. It is not a hosted tracing dashboard.

---

## The problem: the spinner looks fine

I got tired of debugging agents in a 4k-line log.

A turn would go: load a skill, `Read` a file, call an MCP tool, then a polite paragraph. When the issue was wrong, or slow, or expensive, I could see the paragraph. I could not see which skill actually loaded, which tool ran, which **model** did it, or why it picked that MCP server.

That is the same lie in a product chat UI and in Claude Code. The vendor is not the bug. The missing route is.

LangSmith and Langfuse are good at the warehouse job. I did not want another SaaS tab as the *only* way to see a turn. I wanted the trace where the work happens.

---

## The solution: one canvas, two doors

**prompt → thinking → skill → tool / MCP / subagent → answer**

Click a node; the inspector shows why, the input, the output, tokens, and how long it took.

### Door 1 — inside the chat UI you already ship

Four lines. Point `events-url` at your agent's SSE. Claude, Codex, OpenAI, or your own loop — emit JSON (or use `TraceAdapter`). The canvas draws. You do not migrate runtimes.

### Door 2 — beside Claude Code

Keep Claude Code. One command writes local hooks into this folder’s `.claude/settings.local.json`. A browser tab at `http://127.0.0.1:3334` lists sessions and grows the same graph.

```bash
npx agent-think-map claude --install
```

Restart `claude` if it was already open. Ask it to use a tool. The graph grows.

The one-command CLI install is Claude Code today. Other CLIs are not wired yet. The **viewer** is not Claude-shaped.

---

No account. No API key for the demo. MIT. If you need a hosted trace warehouse, use LangSmith. If you need the route *while it happens*, this is the canvas.

Local studio and embed stay free. Pro (when it opens) is 14 days free, then a subscription for cloud history and shareable replays — not a tax on seeing the graph on your machine.

Try the fixture replay:

https://nimrodfisher.github.io/agent-think-map/
