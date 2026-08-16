# Contributing

The UI is a viewer. New agent architectures belong in an **adapter** that emits `AgentTraceEvent` JSON. Do not fork the canvas.

1. `npm install` then `npm test`
2. Keep the event schema stable. Additive fields are fine; renaming `type` values is not.
3. A new adapter is one file that maps native messages → `parseAgentTraceEvent`.
4. MIT. By opening a PR you offer the change under the same license.
