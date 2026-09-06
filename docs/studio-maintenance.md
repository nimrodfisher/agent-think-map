# Studio maintenance and package development

[Back to the README](../README.md)

### Recovering hook installation

Both adapters support `--doctor` and `--rollback [full-backup-path]` with the same
`--port` and (for Codex) `--project` scope as installation. Claude uses the current
project's `.claude/settings.local.json`; Codex defaults to `~/.codex/hooks.json`.

Installation saves a timestamped `.bak` beside the config plus an
`.installed.json` companion used for validation and a three-way rollback. Keep
both files together. `--rollback` selects the newest valid backup; supplying its
full path selects a particular installation. Rollback restores the previous hook
settings and preserves unrelated edits made since installation. With no later
edits it restores the original bytes. Rollback itself is backed up. An initial
installation records an empty object as its prior state.

Writes flush a temporary file in the same directory and rename it over the
config. A failed rename leaves the original intact; there is no delete-and-write
fallback. This protects against a partial JSON file on interruption, but is not a
claim of power-loss durability on every filesystem or simultaneous-writer locking.

Run Studio, install hooks, then run `npx agent-think-map claude --doctor` or
`npx agent-think-map codex --doctor`. Doctor uses the installed HTTP hook or exact
Codex forwarding command and waits for its unique synthetic session to appear in
Studio. Codex doctor simulates an opted-in session in a temporary home; it does
not change your consent. This verifies transport, not the real agent's hook
permissions or consent. Restarting Studio rotates tokens, so reinstall hooks
before diagnosing the new process. Synthetic doctor sessions remain visible.

### Compiled npm library

The packed package exports built ESM JavaScript and TypeScript declarations.
Use `import { TraceAdapter } from "agent-think-map"` in plain Node without a
TypeScript loader. The package is ESM-only: CommonJS `require()` is intentionally
not exported. The `/element` entry is for browsers and requires DOM APIs. React
and element styles remain available to Vite consumers; `/styles.css` is also an
explicit stylesheet export.

`npm run build` builds the library with tsup and the existing CDN bundle with
Vite. `npm pack` runs that build automatically. `npm run test:package` packs the
package, installs it outside the monorepo, and checks Node imports, declarations,
Vite execution and styles, and both CLI install/doctor/rollback flows. The CLI
still uses its existing vite-node runner. Claude CLI, Codex CLI, and Vite consumers
already worked on 0.1.2; this maintenance change fixes plain Node library imports.


