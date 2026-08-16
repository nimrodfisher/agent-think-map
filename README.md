# agent-trace

**Watch any AI agent think.**

Skills. Tools. MCP. Why it fired. Live, in every chat UI.

Your agent stays yours. This is only a viewer. Stream JSON, get a canvas.

```
npx agent-trace
```

That opens a demo. No API keys. No account.

---

## Install in any UI (copy this)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/nimrodfisher/agent-trace@main/dist/styles.css" />
<script type="module" src="https://cdn.jsdelivr.net/gh/nimrodfisher/agent-trace@main/dist/element.cdn.js"></script>
<agent-simulator events-url="/sse" layout="split"></agent-simulator>
```

Works in React, Vue, Svelte, PHP, Rails, NanoClaw, a static file — anything that can render HTML.

`layout` is `split` (chat beside canvas), `overlay`, or `canvas-only`.

Put your existing chat inside `split` via the React API, or keep chat where it is and overlay the canvas.

---

## React

```bash
npm i agent-trace
```

```tsx
import { AgentSimulator } from "agent-trace/react";
import "agent-trace/styles.css";

<AgentSimulator events={events} layout="split">
  <YourChat />
</AgentSimulator>
```

`events` is an array, an async iterator, or skip it and pass `eventsUrl="/sse"`.

Until this is on the npm registry, install from GitHub:

```bash
npm i github:nimrodfisher/agent-trace
```

---

## What your agent must emit

One JSON object per step. That's the whole integration.

```json
{
  "type": "node.started",
  "id": "call-1",
  "kind": "mcp",
  "title": "github / create_issue",
  "reason": "Called create_issue on server github",
  "ts": 1710000000
}
```

| `type` | When |
| --- | --- |
| `run.started` | User prompt |
| `node.started` | A step begins (`kind`: `thinking` `skill` `mcp` `tool` `subagent` `answer`) |
| `node.delta` | Streaming text |
| `tool.input` | Tool args (secrets get redacted in the Claude adapter) |
| `node.completed` / `node.failed` | Step ends |
| `run.completed` | Turn over |

Send them as SSE:

```
data: {"type":"node.started",...}

```

A 20-line Node server is enough. See `npx agent-trace` — it does exactly that.

---

## Claude Agent SDK (optional)

```ts
import { ClaudeTraceAdapter } from "agent-trace/claude";

const adapter = new ClaudeTraceAdapter({ runId, prompt });
for await (const message of query({
  prompt,
  options: { includePartialMessages: true },
})) {
  for (const event of adapter.ingest(message)) push(event);
}
```

It maps thinking, `Skill`, `mcp__server__tool`, builtins, and subagents into the JSON above. Any other runtime: emit the JSON yourself. Don't fork the UI.

---

## NanoClaw

Skill: [`packages/adapters/nanoclaw/SKILL.md`](packages/adapters/nanoclaw/SKILL.md) — `/add-simulator`. Copies a runner hook + SSE. Reverse with `REMOVE.md`. Never merge `channels` / `providers`.

---

## Local

```bash
git clone https://github.com/nimrodfisher/agent-trace
cd agent-trace
npm install
npm test
npm run dev
```

MIT. Not affiliated with Sim.

If you add an architecture, add an adapter that emits this protocol. PRs welcome.
