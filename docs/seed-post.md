# Your agent chat log is lying to you

Publish this as-is on [ai-analytics-hub.com](https://ai-analytics-hub.com) (canonical), then Dev.to/Hashnode with that URL as `canonical`. One post this week. Do not also spin a newsletter or YouTube.

Social paste (X / LinkedIn / Reddit / OSS card): `docs/channel-kit.md`.

**Live demo (no key):** https://nimrodfisher.github.io/agent-think-map/  
**Repo:** https://github.com/nimrodfisher/agent-think-map  
**GIF:** `docs/demo.gif` — upload it into the post body, above the fold.

**CMS:** slug `your-agent-chat-log-is-lying-to-you` · tags MCP, Cursor, Context Engineering, Claude · ~4 min

---

A practical look at why agent failures hide in the path — skills, tools, MCP — and how an embeddable canvas makes that path visible inside the chat UI you already ship.

---

## TL;DR

A chat log shows the ending. It does not show the route. When an agent loads a skill, calls a tool, hits an MCP server, and then answers wrong, the transcript still looks like a conversation. The bug was in the path. agent-think-map is an embeddable canvas that draws that path — chain-of-thought, skills, tools, and MCP — inside the chat UI you already ship. It is not a hosted tracing dashboard.

---

## The problem: the transcript looks fine

I got tired of debugging agents in a 4k-line log.

A turn would go: load `frontend-engineer`, `Read` a file, call `github / create_issue`, then a polite paragraph. When the issue was wrong, or slow, or expensive, I could see the paragraph. I could not see which skill actually loaded, which tool ran, or why the model picked that MCP server.

LangSmith and Langfuse are good at the warehouse job. I did not want another tab. I wanted the trace in the product, next to the chat, while the run happened.

---

## The solution: the map lives in the chat

The canvas is a viewer. You keep Claude, Codex, OpenAI, NanoClaw, or your own loop. You emit one JSON object per step (or use the adapter that sniffs those SDKs). The graph grows: prompt → thinking → skill → tool / MCP → answer. Click a node; the inspector shows why, the input, the output, and how long it took.

Try it without an API key. The demo replays a recorded GitHub-issue turn in the browser:

https://nimrodfisher.github.io/agent-think-map/

Or four lines in any HTML page:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/nimrodfisher/agent-think-map@main/dist/styles.css" />
<script type="module" src="https://cdn.jsdelivr.net/gh/nimrodfisher/agent-think-map@main/dist/element.cdn.js"></script>
<agent-think-map events-url="/sse" layout="split"></agent-think-map>
```

MIT. If you need a hosted trace warehouse, use LangSmith. If you need the trace inside the chat you already ship, this is the canvas.
