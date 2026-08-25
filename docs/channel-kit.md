# Launch-week channel kit (model-agnostic)

Today: **Tue 25 Aug 2026**. Ignite **Tue 25 – Thu 27**. Full rules: `docs/gtm-plan.md`.

**Doors:** embed in a chat UI **or** `npx agent-think-map claude --install`  
**Demo (no key):** https://nimrodfisher.github.io/agent-think-map/  
**Repo:** https://github.com/nimrodfisher/agent-think-map  

**Asset:** GIF of a **graph growing**. Best: two-beat (embed/demo, then Claude Code studio). Until a graph GIF exists, do not ignite. A static hero is not motion.

Order: Hub article → Show HN (Tue 23:00) → Product Hunt (Wed 00:01 PT) → X (Wed 9:00 PT) → r/ClaudeCode (Wed after X) → one embed/protocol sub (Thu) → awesome lists.

**LinkedIn seed already ran.** Do not repost that Claude-only body. Follow-up is in §2.

Do not mention Pro / price in titles or tweet 1–5. Footer and first reply only.

---

## 0. Preflight — do not skip

Throwaway folder (not this repo):

```bash
npx agent-think-map claude --install
```

Keep it running. Other terminal, same folder: `claude` → `Read README.md`. Graph must grow. If this fails, **do not Show HN**.

GitHub: About + topics from `docs/gtm-plan.md`. Social preview = `docs/og.png`.

Record 8–12s GIF + 15–30s MP4. Watermark `agent-think-map`.

---

## 1. Website — Open Source card

**Title:** See the agent think — live map in your chat UI or beside Claude Code

**Author:** Nimrod Fisher

**Tools:** MCP · Claude · Codex · GitHub

**Problem:** When a skill loads, Read fires, and an MCP hop goes sideways, the chat log and the CLI still look like a conversation. The bug is in the path — and the path is invisible next to the spinner.

**Solution:** One canvas. Embed it in the chat UI you already ship (any model that emits JSON/SSE), or run it beside Claude Code with one command. Viewer, not a new runtime. MIT. No account.

**Links:** demo · GitHub

Directory blurb:

> Live think-map of skills, tools, and MCP. Model-agnostic. Same canvas in your chat UI or beside Claude Code.

---

## 2. LinkedIn (follow-up — seed already posted)

Do not start a new essay. Comment on your own post **or** a short new update with the GIF:

```
A lot of you felt this: the log shows the ending, not the route.

Quick clarification — this is not Claude-only.

Same live map:
• inside the chat UI you already ship
• or beside Claude Code (one command)

Model-agnostic. Claude, Codex, OpenAI, or your own loop.
You emit JSON. The canvas draws.

Demo (no key): https://nimrodfisher.github.io/agent-think-map/
```

---

## 3. Show HN (Tue 25, 23:00 ICT)

Title:

```
Show HN: See the agent think — live map in your chat UI or beside Claude Code
```

First comment: copy from `docs/gtm-plan.md` (Phase 2). Paste immediately. Staff 6 hours.

---

## 4. X thread (Wed 26, 23:00 ICT)

GIF on tweet 1. **No URL in tweets 1–5.** First reply is the only link.

**1** (attach GIF)

```
Agents don't fail in the answer. They fail in the path.

A skill loads. Read fires. An MCP server hops.
The UI shows a spinner.
```

**2**

```
When the issue is wrong, or slow, or expensive, the transcript still looks like a conversation.

The bug was in the route: which skill loaded, which tool ran, which MCP server it hit — and which model did it.
```

**3**

```
I got tired of debugging that in a 4k-line log.

So I built a live think-map. Same canvas two ways:
in the chat UI you already ship, or beside Claude Code.
```

**4**

```
Model-agnostic. You emit JSON. The canvas draws.

Click a node: why it fired, the input, the output, how long it took.
No account. No API key for the demo.
```

**5**

```
If you need a hosted trace warehouse, use LangSmith.

If you need the route while it happens, this is the canvas.

What's still a black box in your agent loop?
```

**First reply**

```
Demo:
https://nimrodfisher.github.io/agent-think-map/

Claude Code:
npx agent-think-map claude --install

Embed (chat UI): four lines on the README.

Repo:
https://github.com/nimrodfisher/agent-think-map
```

---

## 5. Reddit — r/ClaudeCode (Wed, after X)

Disclose in sentence one. This room is Claude-shaped — that is fine. Last paragraph names the embed so you are not lying.

**Title**

```
I was blind to the tool/MCP path — so I drew it beside Claude Code (same map embeds in a chat UI)
```

**Body**

```
I built this. Disclosing up front.

Claude Code's transcript still looks like a conversation when a skill loads, Read fires, then an MCP hop goes sideways. The hop is the interesting part — and it is invisible next to the spinner.

agent-think-map is a local studio: one command writes HTTP hooks. Keep `claude` in the terminal. A browser tab draws skills, tools, MCP, and subagents as they fire. Click a node for why, input, output, duration.

Same canvas can sit inside a chat UI (any model that emits the JSON/SSE). The viewer is model-agnostic; this one-command install is Claude Code.

Not a new runtime and not a hosted dashboard.

npx agent-think-map claude --install

Fixture replay:

https://nimrodfisher.github.io/agent-think-map/
```

**Thu (different title, different body):** r/mcp — lead with the embed + protocol, mention Claude Code as the CLI door, do not paste this post.

---

## 6. Product Hunt (Wed 00:01 PT)

Tagline: `See the agent think — chat UI or Claude Code`

Maker comment:

```
Same live map two ways. Embed it in the chat UI you already ship (model-agnostic JSON/SSE), or run it beside Claude Code with one command. Viewer, not a warehouse.

npx agent-think-map claude --install
```
