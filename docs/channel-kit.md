# Seed-week channel kit

Paste-ready copy for **today**. This is seed, not launch week. Do **not** Show HN or Product Hunt until 25–27 Aug.

I cannot publish from this machine: no X / LinkedIn / Reddit session, and [ai-analytics-hub.com](https://ai-analytics-hub.com) is not in this repo. Publish in this order so socials do not point at a missing page.

**Asset:** `docs/demo.gif` (native upload on every channel — do not link the GIF as a URL).

| Order | Channel | Link in the post |
| --- | --- | --- |
| 1 | Hub — Open Source card **and** blog | Demo + GitHub |
| 2 | LinkedIn | Hub article if live, else demo |
| 3 | X thread | **No URL in the thread.** First reply = demo |
| 4 | Reddit `r/mcp` only | Demo. Disclose you built it |

Skip `r/LocalLLaMA` today. Skip `r/programming`. One dense sub.

Canonical article body: `docs/seed-post.md`.

---

## 1. Website — Open Source card

Homepage category **Open Source / OSS**. Same Problem / Solution shape as the other Nimrod Fisher cards. Tools: Cursor, Claude, MCP, GitHub.

**Title:** See the agent think inside the chat UI you already ship

**Author:** Nimrod Fisher

**Tools / tags:** Cursor · Claude · MCP · GitHub

**Problem:** When an agent loads a skill, calls a tool, and hops to an MCP server, the chat log still looks like a conversation. The bug is in the path — which skill loaded, which tool ran, which server it hit — and that path is invisible next to the answer.

**Solution:** Drop in an embeddable canvas (`agent-think-map`) that draws chain-of-thought, skills, tools, and MCP as live nodes inside the chat UI you already ship. Click a node for why it fired, the input, the output, and how long it took. Viewer, not a hosted tracing dashboard. MIT. No account.

**Links:**

- Live demo (no API key): https://nimrodfisher.github.io/agent-think-map/
- GitHub: https://github.com/nimrodfisher/agent-think-map
- Blog (after you publish it): https://ai-analytics-hub.com/content/your-agent-chat-log-is-lying-to-you

If the CMS also wants a one-line directory blurb:

> Embeddable canvas that shows an agent’s chain-of-thought, skills, tools, and MCP inside the chat UI you already ship — not a hosted tracing dashboard.

---

## 2. Website — blog CMS fields

Paste the body from `docs/seed-post.md` (from the `#` title down). Fill the CMS chrome with:

| Field | Value |
| --- | --- |
| Title | Your agent chat log is lying to you |
| Slug | `your-agent-chat-log-is-lying-to-you` |
| Author | Nimrod Fisher |
| Excerpt | A chat log shows the ending. It does not show the route. An embeddable canvas that draws skills, tools, and MCP inside the chat UI you already ship. |
| Tags | MCP, Cursor, Context Engineering, Claude |
| Read time | ~4 min |
| Hero / inline media | `docs/demo.gif` above the fold |
| Canonical URL | `https://ai-analytics-hub.com/content/your-agent-chat-log-is-lying-to-you` |

If you also syndicate to Dev.to / Hashnode later this week, set **canonical** to that hub URL. Do not also spin a newsletter or YouTube.

---

## 3. X thread (seed)

Native GIF on tweet 1. **No GitHub or demo URL in tweets 1–5.** 0 hashtags. After posting, stay 30–60 min and reply to comments. Then post the first reply.

**Tweet 1** (attach `docs/demo.gif`)

```
Agents don't fail in the answer. They fail in the path.

A skill loads. Read fires. An MCP server opens a GitHub issue.
The chat UI shows a spinner.
```

**Tweet 2**

```
When the issue is wrong, or slow, or expensive, the transcript still looks like a conversation.

The bug was in the route: which skill loaded, which tool ran, which MCP server it hit.
```

**Tweet 3**

```
I got tired of debugging that in a 4k-line log.

So I built an embeddable canvas that draws the path live — chain-of-thought, skills, tools, MCP — inside the chat UI you already ship.

Not another hosted dashboard.
```

**Tweet 4**

```
The demo replays a recorded GitHub-issue turn in the browser. No API key.

Click a node: why it fired, the input, the output, how long it took.
```

**Tweet 5**

```
If you need a hosted trace warehouse, use LangSmith.

If you need the trace inside the chat you already ship, this is the canvas.

If you ship a chat UI, what's still a black box?
```

**First reply** (this is the only link)

```
Try it, no key:
https://nimrodfisher.github.io/agent-think-map/
```

Do not delete/repost if it is quiet. LinkedIn can carry the same GIF the same day.

---

## 4. LinkedIn

Attach `docs/demo.gif`. Ask for a try, not a star. Link is allowed.

```
Agents don't fail in the answer. They fail in the path.

A skill loads. Read fires. An MCP server opens a GitHub issue. The chat UI shows a spinner. When the issue is wrong, the transcript still looks like a conversation.

I got tired of debugging that in a 4k-line log.

So I built an embeddable canvas that draws the route live — chain-of-thought, skills, tools, and MCP — inside the chat UI you already ship. Not a hosted tracing dashboard.

If you need a warehouse, use LangSmith. If you need the trace next to the chat, this is the canvas.

Try the demo. No API key.

https://nimrodfisher.github.io/agent-think-map/
```

If the hub article is already live, add this line at the end instead of (or after) the demo URL:

```
Write-up: https://ai-analytics-hub.com/content/your-agent-chat-log-is-lying-to-you
```

---

## 5. Reddit — `r/mcp` only

Disclose in the first sentence. Lead with the GIF and the pain. Do not ask for stars. Do not also post `r/LocalLLaMA` / `r/ClaudeAI` / `r/openai` / `r/opensource` today.

**Title**

```
MCP hops disappear in the chat transcript — I drew them as first-class nodes
```

**Body** (upload `docs/demo.gif` as the post image / first media)

```
I built this. Disclosing up front.

When an agent loads a skill, calls a tool, then hits an MCP server, the chat log still looks like a conversation. The hop is the interesting part — and it is invisible next to the answer.

agent-think-map is an embeddable canvas that draws chain-of-thought, skills, tools, and MCP as live nodes inside the chat UI you already ship. Click a node: why it fired, the input, the output, how long it took.

It is a viewer, not a new runtime and not a hosted dashboard. You keep Claude / OpenAI / Codex / your own loop. Emit one JSON object per step, or use the adapter.

Live demo, no API key (replays a recorded GitHub-issue turn that includes an MCP hop):

https://nimrodfisher.github.io/agent-think-map/

MIT. If you need a trace warehouse, use LangSmith. If you need the trace in the product, this is the canvas.

Happy to answer how the MCP nodes are modeled.
```

Stay on the thread and reply to technical questions. Do not ask for stars.

**Hold for later (not today):** `r/LocalLLaMA` — angle = no-key, not SaaS, fixture replay in the browser. Different title, do not paste this `r/mcp` body.
