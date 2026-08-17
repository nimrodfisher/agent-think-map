---
name: add-simulator
description: Install Agent Think Map into this NanoClaw checkout — live skill/tool/MCP visualization over SSE. Additive copies only; never merge channels or providers.
---

# Add Agent Think Map

Install a live thinking canvas into this NanoClaw checkout. NanoClaw has no HTTP API; traces travel as `kind: "trace"` rows in `outbound.db`, and the host exposes them as SSE at `/webhook/simulator`.

Do **not** merge the `channels` or `providers` branches. Copy the files below, append the one-line barrel import, then stop.

## Files to copy

Copy from the Agent Think Map repo (this skill's `files/` directory) into the NanoClaw checkout:

| Source | Destination |
| --- | --- |
| `files/container/agent-runner/src/trace-bridge.ts` | `container/agent-runner/src/trace-bridge.ts` |
| `files/src/modules/simulator.ts` | `src/modules/simulator.ts` |
| `files/public/simulator.html` | `public/simulator.html` |

Overwrite if the files already exist (idempotent re-run).

## Wire the host module

Append this import to `src/modules/index.ts` if it is not already present:

```ts
import './simulator.js';
```

If `src/modules/index.ts` does not exist, append the same line to the host module barrel that already imports scheduling/permissions (search for `onHostStart` or `registerWebhookHandler` usages and put the import next to the other module imports).

## Wire the runner

In `container/agent-runner/src/poll-loop.ts` (or the file that calls `provider.query()`), import and wrap the query iterator:

```ts
import { emitTraceFromQuery } from './trace-bridge.ts';
```

Around the existing `provider.query(...)` loop, replace the raw iterator with:

```ts
const traced = emitTraceFromQuery(provider.query(prompt, options), {
  runId: sessionId,
  prompt: userText,
  writeTrace: (row) => writeMessageOut(row),
});
for await (const message of traced) {
  // existing message handling unchanged
}
```

Enable partial streaming on the query options if the provider is Claude:

```ts
options.includePartialMessages = true;
```

`writeMessageOut` must persist `row.kind === 'trace'` into `outbound.db` `messages_out` the same way chat rows are written. If the writer rejects unknown kinds, add `'trace'` to the allow-list.

## Restart

Restart the host so the webhook handler registers:

```bash
ncl groups restart --id <group-id>
```

Open `http://127.0.0.1:$WEBHOOK_PORT/webhook/simulator` for SSE, and `public/simulator.html` (or serve it) to mount `<agent-simulator events-url="/webhook/simulator">`.

## Verify

1. Send a message that should load a skill or call an MCP tool.
2. Confirm `messages_out` contains rows with `kind = 'trace'`.
3. Confirm the canvas grows a skill/tool/MCP node with a why line.

If any step cannot be applied mechanically, follow the prose beside it. Do not merge git branches.
