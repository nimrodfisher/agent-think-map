# Codex CLI Think-Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Codex CLI the same live think-map studio Claude Code already has: `npx agent-think-map codex` opens a browser, `--install` attaches the current folder’s Codex session, and the graph grows as tools run.

**Architecture:** Keep the canvas and protocol unchanged. Add a Codex CLI adapter that maps Codex lifecycle-hook JSON (stdin) to `AgentTraceEvent`, a local studio HTTP server that accepts those hooks over POST, and an installer that writes project `.codex/hooks.json` with `type: "command"` handlers (Codex has no HTTP hook type). Do not replace `agent-think-map/codex` — that export stays the existing app-server / Agents SDK stream adapter (`OpenAITraceAdapter` / `CodexTraceAdapter`).

**Tech Stack:** Node 20+, vitest, existing `@agent-think-map/core` + protocol. No new dependencies. Codex hooks: command + JSON stdin, documented at https://developers.openai.com/codex/hooks.

**Spec:** This plan *is* the spec. Grounded in `packages/adapters/claude-code/*` (studio, hub, install, hook adapter) and Codex hook payloads (`session_id`, `hook_event_name`, `tool_name`, `tool_use_id`, `tool_input`, `tool_response`, `prompt`, `last_assistant_message`, `model`).

## Global Constraints

- Do not change `package.json` `"exports"."./codex"` away from `./src/openai.ts`. Stream ingest stays `import { CodexTraceAdapter } from "agent-think-map/codex"`.
- Codex handlers are `type: "command"` only. Never write Claude-style `{ type: "http", url }` into `.codex/hooks.json`.
- Hook commands must exit 0 and print **empty stdout**. Codex treats `continue: false` / unsupported PreToolUse output as hook failure (fail-closed on some fields). The forwarder must never echo the hook payload back to stdout.
- Do not subscribe to `PermissionRequest`, `PreCompact`, or `PostCompact` (no graph nodes; extra latency).
- Default studio port **3335** (Claude Code uses 3334). Bind `127.0.0.1` only.
- Project install target is `<cwd>/.codex/hooks.json`, merge without deleting unrelated hook groups. User must trust hooks via Codex `/hooks` — document that in CLI help; do not pass `--dangerously-bypass-hook-trust` from our CLI.
- Reuse the existing web component + CDN bundle. Do not fork the React canvas for Codex.
- Unrelated dirty files on this branch (`packages/core`, `claude-sdk`, `openai`, `claude-code` WIP) are out of scope. Do not commit them with this work.

---

## File map

| File | Responsibility |
| --- | --- |
| `packages/core/src/index.ts` | Classify Codex `Bash` / `apply_patch` titles from `tool_input.command` |
| `packages/adapters/codex/package.json` | New workspace package `@agent-think-map/adapter-codex` |
| `packages/adapters/codex/src/index.ts` | `CodexHookAdapter`: hook JSON → `AgentTraceEvent` |
| `packages/adapters/codex/src/hub.ts` | Session multiplex, `codexHookSettings`, merge install JSON |
| `packages/adapters/codex/src/install.ts` | Write/merge `.codex/hooks.json` + forwarder command |
| `packages/adapters/codex/src/forward.ts` | stdin JSON → POST `/hook`, empty stdout |
| `packages/adapters/codex/src/studio.ts` | HTTP studio (copy Claude Code studio; Codex copy + `/hook`) |
| `packages/adapters/codex/src/cli.ts` | `npx agent-think-map codex` entry |
| `packages/adapters/codex/src/sessions.ts` | Re-export or copy session filter helpers from Claude Code |
| `bin/cli.mjs` | Dispatch `codex` like `claude` |
| `src/codex-cli.ts` | Public exports for the hook adapter / hub / install (optional; CLI can stay internal) |
| `README.md` | Social-ready: both CLI doors, embed, protocol, NanoClaw; honest Codex CLI vs stream adapter |

Tests live next to sources (`*.test.ts`), same as Claude Code.

---

### Task 1: Classify Codex shell and patch tools

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: existing `classifyToolName(name, input?)`
- Produces: `Bash` / `bash` title = first whitespace token of `input.command` (fallback `"Bash"`); `apply_patch` title stays `"apply_patch"` but `summarizeToolInput` already returns `command` when present

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/index.test.ts` inside `describe("classifyToolName"`:

```ts
    expect(classifyToolName("Bash", { command: "cat src/Login.tsx" })).toEqual({
      kind: "tool",
      title: "cat",
    });
    expect(classifyToolName("Bash")).toEqual({
      kind: "tool",
      title: "Bash",
    });
    expect(classifyToolName("apply_patch", { command: "*** Begin Patch" })).toEqual({
      kind: "tool",
      title: "apply_patch",
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/index.test.ts`

Expected: FAIL — `Bash` currently returns `{ kind: "tool", title: "Bash" }` even with a command.

- [ ] **Step 3: Implement the classification**

In `classifyToolName`, after the `mcp__` branch and before `SKILL_FILE_TOOLS`:

```ts
  if (name === "Bash" || name === "bash") {
    const parsed = asToolInputRecord(input);
    const command = typeof parsed?.command === "string" ? parsed.command.trim() : "";
    const title = command.split(/\s+/)[0] || "Bash";
    return { kind: "tool", title };
  }
```

Leave `apply_patch` on the default `{ kind: "tool", title: name }` path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/index.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "feat: title Codex Bash nodes from the command"
```

---

### Task 2: Codex hook adapter

**Files:**
- Create: `packages/adapters/codex/package.json`
- Create: `packages/adapters/codex/tsconfig.json` (copy `packages/adapters/claude-code/tsconfig.json`)
- Create: `packages/adapters/codex/src/index.ts`
- Create: `packages/adapters/codex/src/index.test.ts`

**Interfaces:**
- Consumes: `AgentTraceEvent`, `classifyToolName`, `parseToolInput`, `reasonFor`, `redactSecrets`, `summarizeToolInput` from core; protocol types
- Produces:

```ts
export interface CodexHookAdapterOptions {
  now?: () => number;
}

export class CodexHookAdapter {
  constructor(options?: CodexHookAdapterOptions);
  ingest(hook: unknown): AgentTraceEvent[];
}
```

Map these `hook_event_name` values only: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`. Ignore unknown events (return `[]`). Use `session_id` as `runId`. Use `tool_use_id` as node id. Read `model` from the hook root for `run.meta`. Do not parse transcripts (Codex `transcript_path` is explicitly unstable).

PostToolUse failure: if `tool_response` is a record with `exit_code` a number `!== 0`, or `status === "failed"`, emit `node.failed`. Otherwise `node.completed`. There is no `PostToolUseFailure` event in Codex.

Answer text: `Stop.last_assistant_message` (string or null — skip answer node if null/empty).

- [ ] **Step 1: Scaffold the package files**

`packages/adapters/codex/package.json`:

```json
{
  "name": "@agent-think-map/adapter-codex",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@agent-think-map/core": "*",
    "@agent-think-map/protocol": "*"
  }
}
```

Copy tsconfig from claude-code. Workspaces already include `packages/adapters/*`.

- [ ] **Step 2: Write the failing adapter tests**

```ts
import { describe, expect, it } from "vitest";
import { reduceTraceAll } from "@agent-think-map/core";
import { CodexHookAdapter } from "./index.js";

function eventsOf(adapter: CodexHookAdapter, hooks: unknown[]) {
  return hooks.flatMap((hook) => adapter.ingest(hook));
}

describe("CodexHookAdapter", () => {
  it("opens a run on UserPromptSubmit and tags the Codex model", () => {
    const adapter = new CodexHookAdapter({ now: () => 10 });
    const events = eventsOf(adapter, [
      {
        session_id: "thr_1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Inspect Login.tsx",
        model: "gpt-5.4",
      },
    ]);
    expect(events[0]).toMatchObject({
      type: "run.started",
      runId: "thr_1",
      prompt: "Inspect Login.tsx",
      ts: 10,
    });
    expect(events.some((e) => e.type === "run.meta" && e.model === "gpt-5.4")).toBe(true);
  });

  it("maps Bash Pre/PostToolUse and MCP names", () => {
    const adapter = new CodexHookAdapter({ now: () => 20 });
    const events = eventsOf(adapter, [
      {
        session_id: "thr_1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Open an issue",
      },
      {
        session_id: "thr_1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "call_1",
        tool_input: { command: "cat src/Login.tsx" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PostToolUse",
        tool_use_id: "call_1",
        tool_response: { exit_code: 0, output: "export function Login()" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PreToolUse",
        tool_name: "mcp__github__create_issue",
        tool_use_id: "call_2",
        tool_input: { title: "overflow" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PostToolUse",
        tool_use_id: "call_2",
        tool_response: { number: 41 },
      },
    ]);
    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "tool")).toMatchObject({
      id: "call_1",
      title: "cat",
      status: "completed",
    });
    expect(state.nodes.find((n) => n.kind === "mcp")).toMatchObject({
      id: "call_2",
      title: "github / create_issue",
      status: "completed",
    });
  });

  it("fails a Bash node when exit_code is non-zero", () => {
    const adapter = new CodexHookAdapter({ now: () => 30 });
    const events = eventsOf(adapter, [
      { session_id: "thr_1", hook_event_name: "UserPromptSubmit", prompt: "run" },
      {
        session_id: "thr_1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "call_1",
        tool_input: { command: "false" },
      },
      {
        session_id: "thr_1",
        hook_event_name: "PostToolUse",
        tool_use_id: "call_1",
        tool_response: { exit_code: 1, output: "failed" },
      },
    ]);
    const node = reduceTraceAll(events).nodes.find((n) => n.id === "call_1");
    expect(node?.status).toBe("failed");
  });

  it("completes the run on SessionEnd and draws the Stop answer", () => {
    const adapter = new CodexHookAdapter({ now: () => 40 });
    const events = eventsOf(adapter, [
      { session_id: "thr_1", hook_event_name: "UserPromptSubmit", prompt: "summarize" },
      {
        session_id: "thr_1",
        hook_event_name: "Stop",
        last_assistant_message: "Login exports a component.",
      },
      { session_id: "thr_1", hook_event_name: "SessionEnd", reason: "other" },
    ]);
    const state = reduceTraceAll(events);
    expect(state.nodes.find((n) => n.kind === "answer")?.text).toBe(
      "Login exports a component.",
    );
    expect(events.some((e) => e.type === "run.completed" && e.runId === "thr_1")).toBe(
      true,
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/adapters/codex/src/index.test.ts`

Expected: FAIL — module not found / `CodexHookAdapter` missing.

- [ ] **Step 4: Implement `CodexHookAdapter`**

Mirror `packages/adapters/claude-code/src/index.ts` (`ClaudeCodeHookAdapter`) with these deltas:

- Class name `CodexHookAdapter`; drop `readTranscript` / `noteTranscript`.
- `modelFrom`: `asString(msg.model)` first (Codex common field).
- No `PostToolUseFailure` case.
- `onPostTool`: detect failure via

```ts
function toolFailed(response: unknown): boolean {
  const rec = asRecord(response);
  if (!rec) return false;
  if (asNumber(rec.exit_code) !== undefined && asNumber(rec.exit_code) !== 0) return true;
  return rec.status === "failed";
}
```

- Redact secrets on all previews/inputs the same way Claude Code does.
- `onPrompt` / `onPreTool` / `onStop` / `onSessionEnd` / subagent handlers: same graph shape as Claude Code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/adapters/codex/src/index.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/codex
git commit -m "feat: map Codex CLI hooks to think-map events"
```

---

### Task 3: Hub, hook JSON, installer, and stdin forwarder

**Files:**
- Create: `packages/adapters/codex/src/hub.ts`
- Create: `packages/adapters/codex/src/hub.test.ts`
- Create: `packages/adapters/codex/src/install.ts`
- Create: `packages/adapters/codex/src/install.test.ts`
- Create: `packages/adapters/codex/src/forward.ts`
- Create: `packages/adapters/codex/src/forward.test.ts`

**Interfaces:**
- Consumes: `CodexHookAdapter`
- Produces:

```ts
export const CODEX_HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "SessionEnd",
] as const;

export function codexHookSettings(command: string): {
  hooks: Record<string, Array<{ hooks: Array<{ type: "command"; command: string; timeout: number }> }>>;
};

export function mergeCodexHookSettings(
  existing: Record<string, unknown>,
  command: string,
): ReturnType<typeof codexHookSettings>;

export function installCodexHooks(cwd: string, hookUrl: string): string;
export function hookForwardCommand(hookUrl: string): string;

export class CodexTraceHub {
  ingest(hook: unknown): AgentTraceEvent[];
  drop(sessionId: string): boolean;
  list(): SessionSummary[]; // same shape as ClaudeCodeTraceHub
  subscribe(sessionId: string, listener: (event: AgentTraceEvent) => void): () => void;
}

export function forwardHookPayload(body: string, hookUrl: string): Promise<{ ok: boolean }>;
```

`hookForwardCommand(hookUrl)` must be a single shell command Codex can put in `hooks.json`. Use Node so Windows and Unix share one path:

```ts
export function hookForwardCommand(hookUrl: string): string {
  const script = join(dirname(fileURLToPath(import.meta.url)), "forward.ts");
  // CLI will replace this with the published bin invocation; tests assert URL is embedded.
  return `node --import tsx "${script}" "${hookUrl}"`;
}
```

Do **not** use tsx in production. The installed command must call the CLI:

`npx agent-think-map hook-forward --url <hookUrl>`

Implement `hook-forward` in Task 4 inside `bin/cli.mjs`. For this task, `installCodexHooks` writes that `npx` command (stable public interface). Tests assert the JSON contains `type: "command"` and the URL.

`forward.ts` logic (unit-testable without HTTP by injecting `post`):

```ts
export async function forwardHookPayload(
  body: string,
  hookUrl: string,
  post: (url: string, payload: string) => Promise<Response> = fetch as never,
): Promise<{ ok: boolean }> {
  const res = await post(hookUrl, body);
  return { ok: res.ok };
}
```

When run as CLI (Task 4), read stdin fully, POST `Content-Type: application/json`, then `process.exit(res.ok ? 0 : 1)` with **no stdout**. Timeouts: 5 seconds on most events; `SessionEnd` timeout in hooks.json must be `3` (Codex cap).

- [ ] **Step 1: Write failing hub + install tests**

```ts
// hub.test.ts
import { describe, expect, it } from "vitest";
import { CodexTraceHub, codexHookSettings, mergeCodexHookSettings } from "./hub.js";

describe("CodexTraceHub", () => {
  it("isolates sessions and lists the Codex model", () => {
    const hub = new CodexTraceHub({ now: () => 11 });
    hub.ingest({
      session_id: "a",
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix overflow",
      model: "gpt-5.4",
    });
    hub.ingest({
      session_id: "b",
      hook_event_name: "UserPromptSubmit",
      prompt: "Open issue",
    });
    expect(hub.list()).toEqual([
      expect.objectContaining({ id: "a", prompt: "Fix overflow", model: "gpt-5.4", live: true }),
      expect.objectContaining({ id: "b", prompt: "Open issue", live: true }),
    ]);
  });
});

describe("codexHookSettings", () => {
  it("emits command hooks, not HTTP hooks", () => {
    const settings = codexHookSettings(`npx agent-think-map hook-forward --url http://127.0.0.1:3335/hook`);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0]).toMatchObject({
      type: "command",
      timeout: 5,
    });
    expect(JSON.stringify(settings)).not.toMatch(/"type":"http"/);
    expect(settings.hooks.SessionEnd[0].hooks[0].timeout).toBe(3);
  });
});
```

```ts
// install.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCodexHooks } from "./install.js";

describe("installCodexHooks", () => {
  it("writes .codex/hooks.json command hooks for the studio URL", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-"));
    const file = installCodexHooks(cwd, "http://127.0.0.1:3335/hook");
    const raw = readFileSync(file, "utf8");
    expect(file.replaceAll("\\", "/")).toMatch(/\.codex\/hooks\.json$/);
    expect(raw).toContain("hook-forward");
    expect(raw).toContain("http://127.0.0.1:3335/hook");
    expect(raw).not.toContain('"type": "http"');
  });

  it("keeps an unrelated existing hook group", () => {
    const cwd = mkdtempSync(join(tmpdir(), "atm-codex-"));
    const dir = join(cwd, ".codex");
    const file = join(dir, "hooks.json");
    writeFileSync(
      file,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo keep-me", timeout: 5 }] }],
        },
      }),
      { flag: "wx" },
    );
    // mkdir first
  });
});
```

Fix the second test: `mkdirSync(dir, { recursive: true })` then write the existing file, then `installCodexHooks`, then assert `echo keep-me` is still present **and** `hook-forward` was added to `UserPromptSubmit`.

```ts
// forward.test.ts
import { describe, expect, it, vi } from "vitest";
import { forwardHookPayload } from "./forward.js";

describe("forwardHookPayload", () => {
  it("POSTs stdin JSON to the hook URL", async () => {
    const post = vi.fn(async () => new Response("{}", { status: 200 }));
    const body = JSON.stringify({ hook_event_name: "Stop" });
    await expect(
      forwardHookPayload(body, "http://127.0.0.1:3335/hook", post),
    ).resolves.toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith("http://127.0.0.1:3335/hook", body);
  });
});
```

If `forwardHookPayload` uses a typed fetch wrapper, match that signature in the test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/adapters/codex/src/hub.test.ts packages/adapters/codex/src/install.test.ts packages/adapters/codex/src/forward.test.ts`

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement hub, merge, install, forward**

Hub: copy `ClaudeCodeTraceHub` but construct `CodexHookAdapter` (no `readTranscript`).

`mergeCodexHookSettings`: for each `CODEX_HOOK_EVENTS`, append a command-hook group if that exact `command` string is not already present; preserve other events (e.g. existing `Stop` groups).

`installCodexHooks`:

```ts
mkdirSync(join(cwd, ".codex"), { recursive: true });
const file = join(cwd, ".codex", "hooks.json");
// parse existing object or {}
const command = `npx agent-think-map hook-forward --url ${hookUrl}`;
const merged = mergeCodexHookSettings(existing, command);
writeFileSync(file, `${JSON.stringify({ ...existing, hooks: merged.hooks }, null, 2)}\n`);
return file;
```

Set `timeout: 3` only for `SessionEnd`; `timeout: 5` otherwise.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/adapters/codex/src/hub.test.ts packages/adapters/codex/src/install.test.ts packages/adapters/codex/src/forward.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/codex/src/hub.ts packages/adapters/codex/src/hub.test.ts packages/adapters/codex/src/install.ts packages/adapters/codex/src/install.test.ts packages/adapters/codex/src/forward.ts packages/adapters/codex/src/forward.test.ts
git commit -m "feat: install Codex command hooks that POST to the studio"
```

---

### Task 4: Studio, CLI, bin dispatch, docs

**Files:**
- Create: `packages/adapters/codex/src/sessions.ts` — copy `packages/adapters/claude-code/src/sessions.ts` and import `SessionSummary` from `./hub.js`
- Create: `packages/adapters/codex/src/sessions.test.ts` — copy Claude Code session filter tests if they exist; if `hub.test.ts` already covers list/filter, add one filter test
- Create: `packages/adapters/codex/src/studio.ts`
- Create: `packages/adapters/codex/src/studio.test.ts`
- Create: `packages/adapters/codex/src/cli.ts`
- Modify: `bin/cli.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `CodexTraceHub`, `codexHookSettings`, `installCodexHooks`, `createServer`
- Produces: `createCodexStudio({ hub, root, origin })` → `http.Server`; `npx agent-think-map codex [--install] [--port 3335] [--print-hooks] [--smoke] [--no-open]`; `npx agent-think-map hook-forward --url <url>`

Studio: copy `packages/adapters/claude-code/src/studio.ts`. Replace visible strings `Claude Code` → `Codex`. Keep `/hook` POST that `JSON.parse`s the body and `hub.ingest`s. `/hooks.json` must return `codexHookSettings` with the **command** string (not HTTP settings). Empty rail copy: `Waiting for Codex…`.

`cli.ts`: copy Claude Code CLI; default port 3335; HELP must tell the user to run `/hooks` in Codex and trust the agent-think-map command after `--install`. Smoke fixtures use Codex field names (`tool_name: "Bash"`, `tool_input: { command: "cat README.md" }`, `model: "gpt-5.4"`).

`bin/cli.mjs`:

```js
if (arg === "claude" || arg === "claude-code") { /* existing */ }
else if (arg === "codex") {
  const viteNode = join(root, "node_modules", "vite-node", "vite-node.mjs");
  const script = join(root, "packages", "adapters", "codex", "src", "cli.ts");
  const child = spawn(process.execPath, [viteNode, script, ...process.argv.slice(3)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ATM_CWD: process.cwd() },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else if (arg === "hook-forward") {
  const viteNode = join(root, "node_modules", "vite-node", "vite-node.mjs");
  const script = join(root, "packages", "adapters", "codex", "src", "forward.ts");
  const child = spawn(process.execPath, [viteNode, script, ...process.argv.slice(3)], {
    cwd: root,
    stdio: ["inherit", "ignore", "inherit"], // drop stdout so Codex never sees JSON
    env: { ...process.env },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
```

`forward.ts` CLI (`import.meta.url` main): parse `--url`, read stdin, `forwardHookPayload`, exit 0/1, never `console.log`.

README: after the Claude Code CLI bullets, add:

```
npx agent-think-map codex --install
```

Steps: keep the studio running; in that folder run `codex`; when Codex warns about new hooks, open `/hooks` and trust the agent-think-map command; ask Codex to run a tool.

Update HELP in `bin/cli.mjs` to mention `codex`.

- [ ] **Step 1: Write failing studio + CLI smoke tests**

`studio.test.ts` — POST `/hook` with a Codex `UserPromptSubmit`, GET `/sessions`, expect one session. Copy the pattern from `packages/adapters/claude-code/src/studio.test.ts`.

If Claude Code studio tests start a real server, do the same with `createCodexStudio`.

Also assert GET `/hooks.json` body includes `"type": "command"` and does not include `"type": "http"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/adapters/codex/src/studio.test.ts`

Expected: FAIL — `createCodexStudio` missing.

- [ ] **Step 3: Implement studio, sessions, cli, bin, README**

Copy Claude Code studio/cli; apply Codex naming and hook settings. Implement `forward.ts` main:

```ts
import { readFileSync } from "node:fs";
import { forwardHookPayload } from "./forward.js";

const urlFlag = process.argv.findIndex((a) => a === "--url");
const hookUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : process.argv[2];
if (!hookUrl) process.exit(2);
const body = readFileSync(0, "utf8");
const result = await forwardHookPayload(body, hookUrl);
process.exit(result.ok ? 0 : 1);
```

Only run that main when `process.argv[1]` includes `forward` (so unit tests can import `forwardHookPayload` without exiting). Guard:

```ts
const isMain = process.argv[1]?.includes("forward");
if (isMain && !process.env.VITEST) { /* cli */ }
```

Safer: put CLI in `forward-cli.ts` and keep `forward.ts` pure. Then `bin/cli.mjs` spawns `forward-cli.ts`. Prefer **pure `forward.ts` + `forward-cli.ts`** if the `isMain` guard is flaky under vitest.

- [ ] **Step 4: Run the Codex adapter tests plus full unit suite**

Run: `npx vitest run packages/adapters/codex packages/core/src/index.test.ts`

Then: `npx vitest run`

Expected: PASS. Do not fail the suite on pre-existing dirty-file test failures in unrelated packages; if that happens, run only `packages/adapters/codex` + `packages/core` and report the unrelated failures separately.

- [ ] **Step 5: Manual smoke (when Codex is installed)**

```
npx agent-think-map codex --install --port 3335
```

In another terminal, in the same folder: `codex`. Trust hooks. Prompt: `Read README.md`. Confirm the studio graph shows a Bash/Read-equivalent node.

If Codex is not available in CI, the `--smoke` flag must still render a session:

```
npx agent-think-map codex --smoke --no-open --port 3335
```

Hit `http://127.0.0.1:3335/sessions` and expect one smoke session. Add this as a studio test using `hub.ingest` of the SMOKE array rather than spawning the CLI if spawning is slow.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/codex bin/cli.mjs README.md
git commit -m "feat: live think-map studio for Codex CLI"
```

---

## Out of scope

- Wrapping `codex app-server` JSON-RPC as the CLI attach path (already covered for **embeds** by `OpenAITraceAdapter.onCodexMethod`).
- Tailing `rollout.jsonl` / `transcript_path`.
- Thinking/reasoning nodes from CLI hooks (Codex hooks do not emit chain-of-thought; the graph is prompt → tools/MCP/subagents → answer). Stream adapter remains the path for reasoning items.
- Publishing a new npm major, or renaming `agent-think-map/codex`.

## Self-review

| Spec item | Task |
| --- | --- |
| Live studio beside Codex CLI | 4 |
| Command hooks, empty stdout forwarder | 3, 4 |
| Event mapping + Bash titles + failed exit codes | 1, 2 |
| Keep `./codex` stream export | Global constraint (Task 4 must not retarget it) |
| Trust / `/hooks` documented | 4 README + CLI HELP |
