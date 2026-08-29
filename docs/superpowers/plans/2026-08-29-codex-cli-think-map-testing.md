# Codex CLI Think-Map — Testing Plan (before commit)

Run this **after implementation and before any commit**. The human partner will come back to a working studio; do not claim “done” without the evidence below.

**Pass bar:** every Automated check is green, the smoke studio serves a session, and the README social checklist is complete. Live `codex` TUI is optional if the binary is missing — record that gap explicitly.

---

## 0. What “working” means

| Surface | Passes when |
| --- | --- |
| Unit tests | `npx vitest run packages/adapters/codex packages/core/src/index.test.ts` — 0 failures |
| Full suite | `npx vitest run` — 0 failures on this branch’s Codex + core changes (report unrelated dirty-WIP failures separately; do not mix those files into the Codex commit) |
| Smoke studio | `node bin/cli.mjs codex --smoke --no-open --port 3335` then `GET /sessions` returns the smoke session with a prompt |
| Forwarder | POST of a Codex hook JSON via `hook-forward` produces a session; **stdout of the forwarder is empty** |
| README | Social checklist in §4 — both CLIs, embed, protocol, NanoClaw; no leftover “only Claude Code” one-command copy |
| Export safety | `package.json` `"exports"."./codex"` still points at `./src/openai.ts` |

---

## 1. Automated (must pass)

From repo root:

```bash
npx vitest run packages/core/src/index.test.ts
npx vitest run packages/adapters/codex
npx vitest run
```

Covered behaviors (if a file is missing, the feature is not testable — fail the plan):

| Check | File |
| --- | --- |
| `Bash` + `command` titles as first token | `packages/core/src/index.test.ts` |
| Prompt → Bash → MCP → failed exit_code → Stop answer → SessionEnd | `packages/adapters/codex/src/index.test.ts` |
| Isolated sessions + command (not HTTP) hook JSON + SessionEnd timeout 3 | `packages/adapters/codex/src/hub.test.ts` |
| Install writes `.codex/hooks.json` and preserves unrelated groups | `packages/adapters/codex/src/install.test.ts` |
| Forwarder POSTs body to `/hook` | `packages/adapters/codex/src/forward.test.ts` |
| Studio POST `/hook`, SSE, DELETE, `/hooks.json` is `command` | `packages/adapters/codex/src/studio.test.ts` |
| `bin/cli.mjs` dispatches `codex` and `hook-forward` via `import.meta.resolve("vite-node/...")` | `packages/adapters/codex/src/cli-bin.test.ts` |

Do **not** commit if Codex tests were skipped or if `./codex` export was retargeted.

---

## 2. Smoke without a Codex install (must pass)

Needs CDN or the studio will build it (`ensureCdn`). Prefer existing `dist/element.cdn.js`.

```bash
node bin/cli.mjs codex --smoke --no-open --port 3335
```

In another shell (keep the server running):

```bash
curl -s http://127.0.0.1:3335/sessions
curl -s http://127.0.0.1:3335/hooks.json
curl -s -X POST http://127.0.0.1:3335/hook -H "Content-Type: application/json" -d "{\"session_id\":\"manual\",\"hook_event_name\":\"UserPromptSubmit\",\"prompt\":\"hello from curl\",\"model\":\"gpt-5.4\"}"
```

Pass:

- `/sessions` includes `id: "smoke"` (or equivalent) with a non-empty prompt
- `/hooks.json` contains `"type": "command"` and `hook-forward`; does **not** contain `"type": "http"`
- Manual POST adds a `manual` session
- Open `http://127.0.0.1:3335` in a browser: rail shows the smoke session, canvas is split layout, graph has prompt + tool + answer

Forwarder empty-stdout (PowerShell):

```powershell
$json = '{"session_id":"fwd","hook_event_name":"UserPromptSubmit","prompt":"from forwarder"}'
$out = $json | node bin/cli.mjs hook-forward --url http://127.0.0.1:3335/hook
# $out must be empty; exit code 0
curl -s http://127.0.0.1:3335/sessions
```

Install dry-run in a temp dir (does not require Codex):

```bash
node bin/cli.mjs codex --install --no-open --port 3335
```

Pass: `<cwd>/.codex/hooks.json` exists, command includes `hook-forward` and the port’s `/hook` URL. Do not leave this file in the repo; use a temp cwd (`ATM_CWD`) if testing from the repo.

---

## 3. Live Codex TUI (optional, record if skipped)

If `codex` is on PATH:

1. Studio: `node bin/cli.mjs codex --install --port 3335` from a **scratch folder** (not the git repo if you want a clean tree).
2. In that folder: start `codex`. Trust the new hooks via `/hooks`.
3. Prompt: ask it to read a file (shell/`cat`/`README`).
4. Browser: node for the command, then an answer node after Stop.
5. Confirm the graph does **not** invent chain-of-thought (hooks do not emit reasoning).

Skip if `codex` is missing. Do not block commit solely on this — §1 and §2 are the gate.

---

## 4. README social checklist (must pass before commit)

The README is the source of truth for a launch post. Every existing capability must still be visible; Codex CLI is additive, not a replacement.

| # | Copy / section | Pass |
| --- | --- | --- |
| 1 | Hero tagline mentions **Claude Code and Codex** (or “the CLI you already use”), not Claude-only |
| 2 | Header commands show **both** `npx agent-think-map claude --install` and `npx agent-think-map codex --install` |
| 3 | Badges: Claude Code **and** Codex CLI (plus embed / model-agnostic already there) |
| 4 | “Two doors” table: embed **and** CLI studio for **both** Claude Code and Codex |
| 5 | Remove or rewrite “Other CLIs are not one-command yet” / “one-command CLI install is Claude Code today” |
| 6 | **Claude Code CLI** section kept (port 3334, HTTP hooks, `.claude/settings.local.json`) |
| 7 | **Codex CLI** section: port **3335**, `.codex/hooks.json`, `type: command`, trust via `/hooks`, `--smoke` / `--print-hooks` / `--no-open` |
| 8 | Honest: Codex **CLI** graph is prompt → tools / MCP / subagents → answer; **thinking** nodes come from the embed / `TraceAdapter` / app-server path, not CLI hooks |
| 9 | Embed (CDN + React + `npx agent-think-map` demo) unchanged and still above the fold enough for a screenshot post |
| 10 | Protocol table + `TraceAdapter` / Claude SDK / OpenAI SDK / Codex **app-server** examples still present |
| 11 | NanoClaw pointer still present |
| 12 | “Who this is for” includes Claude Code **and** Codex terminal users |
| 13 | Studio GIF / hero still valid (same canvas); caption can say Claude or either CLI |
| 14 | `package.json` `description` matches the dual-CLI story |

**Social post should be able to say, without lying:**

- Same canvas in a chat UI (embed) **or** beside the terminal.
- One-command studio for **Claude Code** and **Codex**.
- Skills, tools, MCP, subagents, inspector, timeline.
- Model-agnostic protocol; NanoClaw and raw JSON still work.
- Codex CLI does not stream chain-of-thought into the map (hooks don’t send it).

---

## 5. Regression (must not break)

| Check | How |
| --- | --- |
| Claude Code studio tests | `npx vitest run packages/adapters/claude-code` |
| OpenAI / Codex **stream** adapter tests | `npx vitest run packages/adapters/openai` |
| `exports["./codex"]` | `node -e "const p=require('./package.json'); if(p.exports['./codex']!=='./src/openai.ts') process.exit(1)"` |

---

## 6. Commit gate

Commit **only** Codex feature files + README + `bin/cli.mjs` + this plan. Exclude unrelated dirty WIP (`packages/adapters/claude-sdk`, stray core/openai/claude-code edits that are not Bash classification).

Suggested:

```bash
git add packages/core/src/index.ts packages/core/src/index.test.ts
git add packages/adapters/codex bin/cli.mjs README.md package.json
git add docs/superpowers/plans/2026-08-29-codex-cli-think-map.md
git add docs/superpowers/plans/2026-08-29-codex-cli-think-map-testing.md
```

If `packages/core` has unrelated hunks, stage only the `classifyToolName` Bash change (or abort and isolate).
