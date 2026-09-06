<h1 align="center">Agent Think Map</h1>

<p align="center">
  <strong>Your agent took 40 steps. Find the one that matters.</strong><br />
  A visual debugger for AI agents. Follow tools, skills, MCP calls, and subagents.<br />
  Find the run. Inspect the evidence. Get back to building.
</p>

<p align="center">
  <a href="https://nimrodfisher.github.io/agent-think-map/">Try the canvas demo</a>
  &nbsp;·&nbsp;
  <a href="#try-the-new-studio">Try the new Studio</a>
  &nbsp;·&nbsp;
  <a href="#make-it-better-with-us">Contribute</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agent-think-map"><img src="https://img.shields.io/npm/v/agent-think-map?style=flat-square&color=216b54" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-216b54?style=flat-square" alt="MIT license" /></a>
  <a href="#connect-your-coding-agent"><img src="https://img.shields.io/badge/works_with-Claude_Code_·_Codex-22312f?style=flat-square" alt="Works with Claude Code and Codex" /></a>
</p>

<p align="center">
  <img src="docs/hero.png?v=2" alt="Agent execution canvas with connected steps and an inspector for tools, skills, and MCP calls" width="100%" />
</p>

An agent calls a tool, delegates to another agent, hits a permissions error, and keeps going. The final answer is only part of the story. **Agent Think Map makes that execution path explorable.**

Run Studio beside Claude Code or Codex, or embed the canvas in your own application. Keep your existing agent workflow. Inspect the events it emits.

## From “what happened?” to the original evidence

The new Studio brings run history, agent handoffs, and recurring problems into one workspace.

| Start here | What you can do |
| --- | --- |
| **Runs** | Search recorded history, use quick filters, bookmark useful runs, and mark outcomes as Worked or Needs work. |
| **Trace** | Follow the execution graph. Select a step to inspect captured input, output, errors, and duration. |
| **Overview** | Scan run metrics and recorded failures before exploring the full trace. |
| **Agents** | Follow captured parent–child handoffs within a run and jump to the corresponding trace step. |
| **Problems** | Find repeated operation/error pairs across recorded runs, open occurrences, and inspect the evidence with suggested troubleshooting checks. |

**A workspace that makes room for your trace.** Drag the history divider to resize it. Collapse it when you need the canvas. Open History again without losing the trace; narrow screens use a compact drawer. Your sidebar preferences are remembered locally.

For example: open **Problems**, select a repeated permissions error, inspect its captured input, then open the affected run and follow the agent that made the call. Suggested checks help you investigate; the original trace is there to verify them.

> The redesigned Studio is on `main`. The npm package and hosted canvas demo may lag behind the source. Use the source preview below to try these changes now.

## Try the new Studio

**No account or API key needed for the sample preview.** Requires Node.js **22.13 or newer**.

```bash
git clone https://github.com/nimrodfisher/agent-think-map.git
cd agent-think-map
npm ci
npm run build
node node_modules/vite-node/vite-node.mjs scripts/preview-history.ts
```

Open the local URL printed in your terminal. Explore sample runs, nested agents, and repeated errors. This preview uses synthetic data in a temporary database, separate from your real run history. Press Ctrl+C to stop it.

Want a quick look at the published canvas instead?

```bash
npx agent-think-map
```

This replays a recorded turn in your browser. No agent connection required.

## Connect your coding agent

Use the published package commands below, or run `node /path/to/agent-think-map/bin/cli.mjs` in place of `npx agent-think-map` to use your built source checkout. For Claude Code, run the command **from the project where you launch Claude**.

### Claude Code

```bash
npx agent-think-map claude --install
```

1. Keep Studio running; it opens at `http://127.0.0.1:3334`.
2. Restart Claude Code if it was already open, then ask it to use a tool.
3. Watch the trace appear as hooks fire.

Installation adds hooks to the current project's `.claude/settings.local.json`. Install in each project you want to trace. Existing hooks from other tools are preserved.

### Codex Desktop and CLI

```bash
npx agent-think-map codex --install
```

1. Keep Studio running; it opens at `http://127.0.0.1:3335`.
2. Restart Codex Desktop or the CLI to load its hooks. Review or trust the hook command if Codex prompts you.
3. When asked whether to share prompts and tool events with the local map, choose `yes`, `no`, or `later`.

The default install uses `~/.codex/hooks.json` and covers future sessions across projects. Use `--install --project` from a project to scope installation to its `.codex/hooks.json`. Codex Desktop can run normally; it does not need to start from the Studio terminal.

Choosing `yes` enables forwarding for current and future sessions. `no` skips forwarding; `later` defers the choice for that session. Re-running the user-level install resets the consent prompt.

### Useful commands

Replace `claude` with `codex` for the Codex integration.

```bash
npx agent-think-map claude             # Start without changing hooks
npx agent-think-map claude --no-open   # Keep the browser closed
npx agent-think-map claude --smoke     # Load a sample turn
npx agent-think-map claude --doctor    # Check installed hook transport
npx agent-think-map claude --rollback # Restore a backed-up hook configuration
```

Use `--port <number>` to change the port. If Studio is already running on its port, `--install` updates hooks and exits. Keep that existing Studio process running.

See [installation recovery and package development](docs/studio-maintenance.md) for backup behavior, rollback scope, and diagnostic details.

## What the map can show

| Step | Captured context |
| --- | --- |
| Prompt | What the user asked |
| Reasoning | Reasoning events when exposed by the runtime |
| Skill | The instruction pack loaded and its recorded context |
| Tool | Builtin calls such as Read, Bash, and Grep |
| MCP | The server and tool involved |
| Subagent | Delegated work and captured parent relationships |
| Answer | The response returned to the user |

Inspect available inputs, output previews, errors, timings, token usage, and cost. The timeline lets you scrub through the turn. Parallel tools and subagents retain their branching structure.

The map reflects **recorded events**. Reasons, usage, and cost depend on what the runtime supplies. Codex lifecycle hooks do not stream chain-of-thought. Agent relationships currently follow captured parents within a run; cross-run agent lineage is future work.

## Local history, clear boundaries

Studio stores versioned events in `~/.agent-think-map/runs.db` using SQLite. Claude and Codex use the shared local storage implementation. History survives restarts; unfinished sessions become interrupted.

Import existing Claude Code history without setting up hooks (available in this source checkout):

```bash
npx agent-think-map claude --import-history --dry-run
npx agent-think-map claude --import-history
# Optional: --history-root /path/to/claude/projects
```

Use `node /path/to/agent-think-map/bin/cli.mjs` in place of `npx agent-think-map` until this source version is published. The command reads main-session transcripts under `~/.claude/projects`, prints import/skip counts, and exits. Open Studio normally afterward to search, label, and bookmark the imported runs. They show an **Imported** marker and can be selected using **Filters → Origin**. Everything stays local; dry-run simulates against an in-memory snapshot without creating or migrating the history database.

Repeat imports add only new transcript events. Sessions already containing live-captured evidence are skipped. If live capture later continues an imported session, its origin becomes Live and further imports skip it; historical overlap is not reconciled. Separate subagent transcript files are excluded, while Task and sidechain relationships recorded in the main transcript are retained. An assistant finishing a turn does not prove the session ended: without explicit session-end evidence, an imported run is shown as interrupted. This indicates incomplete capture, not a failed outcome.

- **No hosted account required.** The Studio integrations send trace events to the local server.
- **Search recorded context.** Search covers indexed prompts, labels, models, operations, previews, and errors; it is not a full-text search of every raw payload.
- **Separate execution from outcome.** A completed run can still need work. Outcome labels are your judgment.
- **Inspect recurring errors.** Problem groups match captured operation/error identity. They scan up to the newest 10,000 errors and show up to 20 recent occurrences per group, with a notice when coverage is partial.
- **Keep evidence close.** Suggested troubleshooting checks are starting points, not verified root causes or automatic fixes.

Mark a run Worked, then use Compare… on a candidate to choose it as a baseline and jump to the first detected difference. Everything stays local. Alignment is provisional: divergence is a lead to investigate, not proven causation.

Backend analyzer V2 reports `match` (`exact` or `inferred`) and `matchBasis` on every alignment row. Exact correspondence requires captured operation identities, equal fingerprints unique within each turn, and finished steps. Only exact pairs with equal status/output class are matched; structural user/answer nodes can therefore be inferred differences even when identical. Warnings count inferred paired steps, excluding missing/inserted steps. The first divergence is an investigative lead, not proof of a cause. Fingerprint V1 remains provisional.

Trace data can contain prompts and tool content. Review captured data before sharing a screenshot or attaching a trace to an issue.

## Put the canvas in your own app

### Web component

Point `events-url` at your agent's SSE endpoint:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/agent-think-map@0.1.2/dist/styles.css" />
<script type="module" src="https://cdn.jsdelivr.net/npm/agent-think-map@0.1.2/dist/element.cdn.js"></script>
<agent-think-map events-url="/sse" layout="split"></agent-think-map>
```

Layouts: `split`, `overlay`, or `canvas-only`. `<agent-simulator>` remains an alias.

### React

```bash
npm i agent-think-map
```

```tsx
import { AgentSimulator } from "agent-think-map/react";
import "agent-think-map/styles.css";

<AgentSimulator events={events} layout="split">
  <YourChat />
</AgentSimulator>
```

Pass an array or async iterator as `events`, or use `eventsUrl="/sse"`.

### Bring your runtime

`TraceAdapter` accepts supported Claude Agent SDK, OpenAI Agents SDK, and Codex app-server events:

```ts
import { TraceAdapter } from "agent-think-map";

const adapter = new TraceAdapter({ runId, prompt });
for (const event of adapter.ingest(nativeEvent)) {
  push(event);
}
```

For another runtime, emit the shared event protocol. For example:

```json
{
  "type": "node.started",
  "id": "call-1",
  "kind": "mcp",
  "title": "github / create_issue",
  "reason": "Called create_issue on server github",
  "ts": 1710000000000
}
```

The protocol includes `run.started`, `run.meta`, `node.started`, `node.delta`, `tool.input`, `node.completed`, `node.failed`, and `run.completed`. Send frames as SSE `data:` messages. See the [event schema](packages/protocol/src/index.ts) and [sample traces](fixtures).

Using NanoClaw? Start with the [runner integration](packages/adapters/nanoclaw/SKILL.md) and [removal instructions](packages/adapters/nanoclaw/REMOVE.md).

## Make it better with us

**Open source. MIT licensed. Built for people building with agents.**

The next useful feature might come from the trace that confused you today. You can help without writing an adapter:

- **Try a real workflow.** Tell us where you lost the thread, which step you could not find, or what the inspector was missing.
- **Report a reproducible bug.** Include your OS, Node version, agent integration, expected behavior, and a sanitized screenshot or small fixture.
- **Improve the experience.** Keyboard navigation, responsive layouts, clearer errors, and documentation all matter.
- **Connect another runtime.** Map its events to the shared protocol so it can use the same canvas.

[Open an issue](https://github.com/nimrodfisher/agent-think-map/issues/new) · [Read the contribution guide](CONTRIBUTING.md) · [Explore the UX roadmap](docs/run-history-ux-plan.md)

If the map helps you explain an agent failure, share a short recording and link back to the repo. **Star the project** if you want to help more agent builders find it.

### Develop locally

After cloning and installing dependencies:

```bash
npm run dev       # Demo app with development tooling
npm test          # Test suite
npm run build     # ESM library, declarations, and CDN assets
```

Use the [Studio preview](#try-the-new-studio) to work on run history and troubleshooting. See [package development](docs/studio-maintenance.md#compiled-npm-library) for package-consumer checks.
