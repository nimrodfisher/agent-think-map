# Remove Agent Think Map

Reverse `/add-simulator`. Do not `git revert` a merge — this skill never merged.

1. Delete `container/agent-runner/src/trace-bridge.ts`
2. Delete `src/modules/simulator.ts`
3. Delete `public/simulator.html`
4. Remove `import './simulator.js';` from the host module barrel
5. In `container/agent-runner/src/poll-loop.ts`, restore the raw `provider.query(...)` loop and drop `emitTraceFromQuery` / `includePartialMessages` if you added them only for the simulator
6. Restart the group: `ncl groups restart --id <group-id>`
