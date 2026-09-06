# Brief 0B verification

Only Brief 0B was implemented. The checkout was fast-forwarded from `30fbda3`
to the verified `75d4324` milestone before edits. No merge conflicts occurred.

## Patch provenance and order

The repository had no pending maintenance changes. Downloads contained the
handoff briefs, positioning patch, and E2E-suite patch. Their file lists/content
did not contain either prepared maintenance implementation. The required
behavior was therefore implemented directly, as authorized, in this order:

1. Recoverable hook installation, rollback, and doctor.
2. Compiled ESM library output and clean-room package verification.

## Acceptance evidence

| Criterion | Verification |
| --- | --- |
| Preserve unrelated configuration and make restorable backups | Both installers tested with existing settings/hooks; original bytes saved in timestamped backups; exact restoration without later edits; later unrelated settings and hooks survive rollback. |
| Selected/latest valid rollback | Latest skips corrupt backups; explicit invalid/foreign backup rejected; selecting an older installation undoes subsequent installations while preserving intervening user edits. |
| No half-written JSON on failure/interruption | Temp file is flushed then renamed in the same directory. Injected rename/flush failures and a child process interrupted before rename leave the original complete JSON. No unlink fallback. |
| Doctor observes its own synthetic event | Real Claude and Codex Studios receive unique doctor sessions through installed HTTP/command handlers. Tests check session ID, prompt and event count. Stale token, missing hook and HTTP success without ingestion fail with instructions. |
| Plain Node ESM import | Tarball installed in a new temp project outside the monorepo. Public root, Claude, Claude Code, OpenAI, Codex and React imports execute without a TypeScript loader. |
| Honest CommonJS support | Explicit ESM-only exports; `require('agent-think-map')` is tested to reject with `ERR_PACKAGE_PATH_NOT_EXPORTED`. |
| Declarations | Standalone strict NodeNext TypeScript consumer resolves every public entry's declarations. |
| CLI behavior | Both source and packed public CLI entries install, run doctor and roll back in isolated HOME/CWD. Packed CLI starts each actual Studio. |
| Vite behavior | Blank-project Vite build using packed public exports succeeds; its output executes in jsdom, registers both custom-element tags and preserves React Flow/application styles. |

## Commands and results

- Recovery component independently: `npm test` — 227 tests, 46 files passed;
  `npm run build` — existing Vite CDN build passed.
- Compiled component: `npm test` — 227 tests, 46 files passed;
  `npm run build` — tsup JavaScript/declarations and Vite CDN passed.
- `npm run test:package` — npm pack (including prepack full build), blank-project
  npm install, Node imports, CommonJS rejection, TypeScript declarations,
  Vite/jsdom smoke, packed Claude CLI and packed Codex CLI all passed.
- `git diff --check` checked before final commit.

## Limits

Verified on Windows with Node 24.16.0 and npm 11.13.0. macOS/Linux behavior,
network filesystems, power-loss durability, Windows ACL preservation and true
simultaneous-writer locking were not verified. Failed/interrupted writes were
simulated on the local Windows filesystem. The optimistic pre-write check
catches edits since the initial read but is not a cross-process lock.

Doctor verifies synthetic transport through the configured path. Codex uses an
isolated opted-in home for the synthetic payload; this does not prove real-agent
consent, hook trust or permissions. No real user configuration is changed by the
isolated tests. The browser verification is jsdom execution of a Vite production
bundle, not a manual browser/real-agent session. The `/element` export requires
DOM APIs. Normal Studio tokens rotate on restart and hooks must be reinstalled.

No version bump, push, publication, storage/API milestone or Brief 1 work.
Claude CLI, Codex CLI and Vite consumers already worked on 0.1.2; the package
maintenance fixes plain Node library consumption.
