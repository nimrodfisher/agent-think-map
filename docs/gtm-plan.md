# Go-to-market: agent-think-map

Two tracks in parallel. Companion paste kit: `docs/channel-kit.md`. Canonical article: `docs/seed-post.md`.

**Track A — viral OSS (this week):** stars, tries, screenshots. The map is free locally and as an embed.

**Track B — paid (in flight, not in the viral posts):** 14 days free, then subscription. Do not put a paywall on the first tweet. The trial landing is a second URL, used in replies and on the hub.

---

## Positioning (freeze)

The LinkedIn seed hit a real pain: **you cannot see the route**. That pain is not Claude-shaped. A chat spinner and a CLI spinner lie the same way.

| Component | Now |
| --- | --- |
| Competitive alternatives | The transcript / spinner **and** hosted warehouses (LangSmith / Langfuse). |
| Unique attributes | One live canvas: skills / tools / MCP / subagents. Same graph in a chat UI **or** beside Claude Code. Model is a filter, not a lock-in. |
| Value | See which skill loaded, which tool ran, which MCP hop, which model, tokens, duration — while the turn is still happening. |
| Customers | (1) People who already run agents daily (Claude Code, Codex, Cursor, custom chat). (2) Teams shipping a chat UI. |
| Market you can win | In-product / beside-the-runtime think-map. Not “LLM observability as a warehouse.” |

**Do say:** model-agnostic. Same canvas whether you live in a chat UI or in Claude Code. Claude, Codex, OpenAI, or your own loop — you emit JSON (or use an adapter); the canvas draws.

**Do not say:** “any AI agent” as if every CLI is one-command today. Truth: **the viewer is model-agnostic. The one-command CLI install is Claude Code. Other CLIs are not wired yet.** Embed + `TraceAdapter` already cover Claude / Codex / OpenAI streams.

**One sentence (use everywhere):**

> See the agent think — same live map in your chat UI or beside Claude Code. Model-agnostic.

Cocktail-party: **“You can actually see the agent think.”**

**Compare copy:** “If you need a hosted trace warehouse, use LangSmith. If you need the route *while it happens* — in the chat you ship or beside the CLI — this is the canvas.”

**Why a stranger stars it in 20 seconds:**

1. GIF: a tool/MCP node appears while a spinner would have been the only UI.
2. Two doors, one graph: four-line embed **or** `npx agent-think-map claude --install`.
3. No API key for the demo. They try it in under 5 minutes.

---

## Snapshot (25 Aug 2026)

Today is **Tue 25 Aug**. LinkedIn already ran and confirmed the pain. Ignition is **now**, with the copy below — not the old Claude-only headline.

| Fact | Status |
| --- | --- |
| GitHub | [nimrodfisher/agent-think-map](https://github.com/nimrodfisher/agent-think-map) |
| CLI install | `npx agent-think-map claude --install` (Claude Code) |
| Embed | `<agent-think-map events-url="…">` — any model that emits the JSON/SSE protocol |
| Live demo | [GitHub Pages](https://nimrodfisher.github.io/agent-think-map/) — fixture replay, no key |
| npm | [agent-think-map@0.1.0](https://www.npmjs.com/package/agent-think-map) — CTA is `npx agent-think-map claude --install` |
| Motion | Need **two beats in one GIF** if you can: (1) embed/demo graph growing, (2) Claude Code studio. If you only have one, lead with the surface that matches the channel (see kit). |
| Your reach | GitHub + [ai-analytics-hub.com](https://ai-analytics-hub.com) + LinkedIn (pain already validated) |

---

## This week (25–29 Aug 2026, ICT)

Staff replies. Replies beat likes. LinkedIn seed is done — do **not** paste the same Claude-only body again.

| When (ICT) | Channel | Job |
| --- | --- | --- |
| **Tue 25, today** | Preflight + copy | GitHub About + topics. Smoke `--install` in a throwaway folder. Publish hub article with **model-agnostic** title. Record GIF. **Show HN 23:00** if install + Pages + GIF are real. |
| **Tue 25, evening** | LinkedIn comment / follow-up | Short: “Not Claude-only. Same map in the chat UI. Model is a column, not a vendor.” Link demo. Do not start a new essay. |
| **Tue 25, 23:00** | **Show HN** (9:00 PT) | Ignition. New title (frozen below). Staff 6 hours. |
| **Wed 26, 14:01** | Product Hunt (00:01 PT) | Badge. Tagline is model-agnostic. Gallery shows **both** doors. |
| **Wed 26, 23:00** | X thread (9:00 PT) | Native GIF. **No URL in tweets 1–5.** Link in first reply. Stay 30–60 min. |
| **Wed 26, after X** | **r/ClaudeCode** | Claude-shaped angle (honest: that sub is the CLI). Disclose. |
| **Thu 27** | **r/mcp** or **r/LocalLLaMA** (pick one) | Embed / model-agnostic angle. **Different body** from r/ClaudeCode. |
| **Thu 27** | awesome-claude-code first, then awesome-mcp / awesome-ai-agents | Long-tail. One PR per list. |
| **Fri 28** | LinkedIn | Recap screenshots + “14-day Pro waitlist” only in the last line, not the hook. |

Do **not** Show HN until:

1. `npx agent-think-map claude --install` works on a machine that is not this repo.
2. Pages demo loads: https://nimrodfisher.github.io/agent-think-map/
3. The GIF shows a **graph growing**, not a static README.

Do **not** dump every subreddit the same hour. Density first: HN → PH → X → one Claude sub → one protocol/embed sub.

---

## GitHub chrome (do today)

About (under 350 characters):

```
See the agent think — live map of skills, tools, MCP, subagents. Model-agnostic. Same canvas in your chat UI or beside Claude Code. No account. MIT.
```

Topics (max 20) — **do not** lead with only claude-code:

```
ai-agents
observability
claude-code
mcp
llm
tracing
developer-tools
visualization
web-components
typescript
openai
codex
llmops
chain-of-thought
sse
agent-observability
react
claude
openai-agents
```

Social preview: `docs/og.png`.

---

## Phase 0 leftovers (block ignition if undone)

- [ ] GitHub About + topics + social preview
- [ ] GIF (8–12s) + MP4 for X. Watermark `agent-think-map`. Under ~5 MB.
- [x] `npm publish` `agent-think-map@0.1.0`
- [ ] Pin CDN to a git tag after first GitHub release (README/embed already use jsDelivr npm `@0.1.0`)
- [ ] Smoke `--install` outside this repo
- [ ] Hub OSS card + article (`docs/seed-post.md`)

---

## Track A — Viral copy rules

1. **Hook = the path, not the vendor.** First line is never “for Claude Code.” First line is the lie the log tells.
2. **Name both doors by tweet/comment 3.** Chat UI embed + Claude Code CLI.
3. **CTA matches the room.** HN and X: demo + both commands. r/ClaudeCode: `--install`. A chat-UI thread: the four-line embed.
4. **Do not mention price, trial, or Pro** in tweet 1–5, Show HN title, or Reddit title. Conversion lives in the first *reply*, the hub footer, and Friday LinkedIn.
5. Ask for a **try**, not a star.

---

## Track B — 14 days free, then subscription

OSS stays MIT and local/embed stay free. That is the viral engine. Paid is a **layer**, not a bait-and-switch.

### What Pro is (freeze this story)

| Free (forever) | Pro (trial → paid) |
| --- | --- |
| Local Claude Code studio | Cloud history beyond the local process |
| Embed the canvas in your chat UI | Shareable replay links (send a turn, not a screenshot) |
| Fixture demo, MIT, no account | Team seats, retention, export |
| One machine, one graph | Same graph, persisted and shareable |

Do not charge for “seeing the graph locally.” That would kill the LinkedIn motion.

### Offer

- **14-day Pro trial.** Email to start. **No credit card** on day 0 (viral > friction). Card on day 12 reminder, charge on day 15 if they keep Pro.
- After trial: **subscription**. Draft price (change after 20 talks, not after 20 tweets): **$19 / developer / month**, or **$16 / month billed annual**. Team: **$12 / seat / month** (min 3) with shared history.
- One product: Pro. No fake four-tier grid this month.

### Where the trial lives

- Landing: hub page `/think-map` or `/agent-think-map` (not in this repo). Button: **Start 14-day Pro trial**. Secondary: GitHub / `npx` / embed docs.
- In-product: local studio footer — “Free locally. Pro keeps history in the cloud — 14 days.” One line. Not a modal on first paint.
- Waitlist until checkout exists: same button, “Get Pro when it opens — 14 days free.” Collect email. Do not delay OSS ignition for Stripe.

### Build order (do not block Show HN)

1. **This week:** copy, waitlist form, email sequence outline (day 0, 7, 12, 14).
2. **Week 2:** Stripe (or Lemon Squeezy) checkout + 14-day trial flag.
3. **Week 2–3:** cheapest Pro wedge that is *true*: hosted session replay **or** shareable link. Ship one, not both.
4. **Not this month:** SSO, warehouse ingest, “replace LangSmith.”

### Email sequence (outline)

| Day | Job |
| --- | --- |
| 0 | You are in. Local/embed stay free. Pro trial is history + share. |
| 7 | One GIF of a shareable replay (or mock if not shipped). Ask what they would pay to send a turn to a teammate. |
| 12 | Trial ends in 2 days. Price. Cancel = you keep OSS. |
| 14 | Charged or expired. Receipt or “you are back on free local.” |

---

## Phase 2 — Ignite posts

### Show HN — Tue 25 Aug 23:00 ICT (9:00 PT)

**Title (freeze this):**

```
Show HN: See the agent think — live map in your chat UI or beside Claude Code
```

First comment (paste immediately):

```
I built this because agents fail in the path, not the answer.

A skill loads. Read fires. An MCP server hops. The chat UI and the
CLI both show a spinner. The transcript still looks like a conversation.

agent-think-map is a viewer, not a new runtime. Same canvas two ways:

1. Embed in the chat UI you already ship (SSE / JSON). Model-agnostic —
   Claude, Codex, OpenAI, or your own loop.
2. Beside Claude Code: one command writes local hooks. Claude stays in
   the terminal. The graph opens in the browser.

npx agent-think-map claude --install

If you need a hosted warehouse, use LangSmith. If you need the route
while it happens, this is the canvas.

Live fixture demo (no key):
https://nimrodfisher.github.io/agent-think-map/
```

Stay 6 hours. Reply to hooks, embed, protocol, ports. If someone asks about paid: Pro is 14 days free then a subscription for **cloud history / shareable replay**; local and embed stay free. One sentence. Do not pitch.

### Product Hunt — Wed 26 14:01 ICT (00:01 PT)

- Tagline: `See the agent think — chat UI or Claude Code`
- Gallery: (1) spinner / lying log, (2) embed four lines, (3) graph growing, (4) `--install` + studio, (5) inspector click
- Maker comment: both doors + what it is not

---

## Phase 3 — Compound (weeks 3–8)

1. Ship a visible canvas tweak every 1–2 weeks (repo looks alive).
2. GIF-first posts: model filter, subagent siblings, token totals, **shareable replay** when Pro exists.
3. Pin `Show us your map`. Dual audience: studio screenshots **and** in-chat embeds.
4. Convert waitlist → trial as soon as one Pro wedge is real.

---

## SEO (supertanker — not this week)

| Surface | Intent | Owns |
| --- | --- | --- |
| README | Navigational | `see the agent think`, `agent think map` |
| Live demo | Try without a key | `visualize AI agent thinking` |
| Hub article | Informational | “the log is lying / the path is the bug” |
| Later `/vs` | Commercial | vs LangSmith. Own URL. |

Do not fabricate schema ratings. Do not buy stars.

---

## Copy bank (freeze)

**Hook (no link):**

```
Agents don't fail in the answer. They fail in the path.
```

**Both doors:**

```
Same live map in the chat UI you ship, or beside Claude Code.
Model-agnostic. You emit JSON. The canvas draws.
```

**What it is not:**

```
If you need a hosted trace warehouse, use LangSmith.
If you need the route while it happens, this is the canvas.
Local and embed stay free. No account to try.
```

**Pro (replies / footer only):**

```
Pro is 14 days free, then a subscription — cloud history and shareable
replays. The local studio and the embed stay MIT.
```

---

## Metrics

| Window | Weak | On track | Hit |
| --- | --- | --- | --- |
| 48h | < 30 stars, nobody ran install or opened demo | 80–200 stars **and** “I tried it” comments from **both** CLI and embed people | Trending |
| 7 days | < 50 | 200–500, GIF circulating | inbound protocol / hook questions |
| 14 days | no waitlist emails | 50+ trial/waitlist emails | first paid (when checkout exists) |
| 30 days | flat stars | weekly organic + repeat screenshots | Pro conversion ≥ 5% of trials |

If 48h is weak: do not delete/repost the X thread. Fix the leak (install broken, GIF is a static hero) and wait 4–6 weeks.

---

## Execution checklist

- [ ] About, topics, social preview (model-agnostic)
- [ ] GIF + MP4
- [x] npm publish (`0.1.0`)
- [ ] Smoke `--install` outside this repo
- [ ] Hub OSS + article (new title)
- [ ] LinkedIn follow-up (both doors) — seed already posted
- [ ] Tue Show HN (title frozen above)
- [ ] Wed PH + X + r/ClaudeCode
- [ ] Thu second sub (embed angle) + awesome lists
- [ ] Waitlist / trial landing copy live (even if Stripe is not)
- [ ] Fri LinkedIn recap + Pro last line
