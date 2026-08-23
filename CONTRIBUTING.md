# Contributing

The UI is a viewer. New agent architectures belong in an **adapter** that emits `AgentTraceEvent` JSON. Do not fork the canvas.

1. `npm install` then `npm test`. Adding a workspace package (`packages/*`, `packages/adapters/*`, `apps/*`) requires committing the updated `package-lock.json` — CI uses `npm ci` and will fail if the lockfile is stale.
2. Keep the event schema stable. Additive fields are fine; renaming `type` values is not.
3. A new adapter is one file that maps native messages → `parseAgentTraceEvent`.
4. MIT. By opening a PR you offer the change under the same license.
