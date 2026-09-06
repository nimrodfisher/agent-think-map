# Brief 1 verification

Baseline: fast-forwarded this worktree from `30fbda3` to `b0a294f` before implementation.
Storage/protocol milestone only; no search or diff UI, publishing, or new provider.

## Storage and packaging decision

The package now requires **Node >=22.13.0** and uses built-in `node:sqlite`.
Node 20 support is intentionally retired for this milestone. No native npm addon,
postinstall compiler, or SQLite dependency is required. The package lock records
the same engine requirement. Node 22's SQLite API may emit an experimental warning.

The initial Windows spike used `DatabaseSync` to create, insert, select, and close
a database on **Windows, Node 24.16.0**. Clean-package verification subsequently
installed the packed package in a blank temporary project and exercised SQLite,
both installed CLIs, and restart/resume. This caught and fixed tsup's default
removal of the `node:` prefix: `node:sqlite` must retain its prefix.

Existing compiled ESM/type export paths remain intact. Node-only storage APIs are
exported at `agent-think-map/storage`; envelope parsing is exported at the root.
The browser entry points still pass the standalone Vite/jsdom consumer check.
`.github/workflows/windows-storage.yml` adds Node 22.13.0 and 24.x Windows jobs.
Those remote CI jobs have not run locally; the executed runtime was Node 24.16.0.

## Behavior and API notes

- Default database: `~/.agent-think-map/runs.db`; inject `path` into the store/hub
  or `dbPath` into Studio. Tests use in-memory databases or temporary directories.
- `TraceHub` owns persistence, summaries, metadata, replay, and recovery. Provider
  wrappers retain only live adapter instances. Their mutation/list APIs now return
  promises; HTTP and CLI callers await them. Bare `AgentTraceEvent` parsing and
  reduction remain compatible.
- V1 envelopes validate known fields while preserving top-level and nested JSON
  extensions. Sequences are assigned by the store, ignoring producer sequence hints.
  The session ID remains the historical run ID; cross-provider ID collisions fail
  explicitly instead of combining runs.
- Producer IDs are authoritative. Hook delivery IDs use provider/session plus
  explicit event/hook IDs or the hook phase and tool-use ID. Unidentified deliveries
  get unique IDs, so identical legitimate repeats survive. Provenance is stored.
  Redelivery without a stable ID cannot safely be deduplicated.
- SQLite hook delivery groups commit atomically through optional `appendBatch`.
  Injected third-party stores can implement that extension for group atomicity;
  the required `append` contract remains atomic per event.
- Recovery marks the current provider's previous running rows interrupted. The
  CLI performs recovery after binding its port, before processing hooks, so a
  failed second launch cannot interrupt the active server. Use one active Studio
  per provider; concurrent database connections are supported, but multiple
  independent adapter owners for one provider/session are not coordinated.
- Store pagination uses an opaque `(updatedAt, runId)` cursor, default limit 100,
  maximum 1000. Studio's compatible array listing shows the latest 1000 sessions;
  older runs remain available through the paginated store API and direct replay.
- SSE keeps bare event JSON in `data:` and adds `id: <sequence>`. `Last-Event-ID`
  takes precedence over `?after=`. Invalid cursors return 400. Register-before-read
  plus a per-listener cursor and reentrant drain prevents a replay/live gap.
  A 100 ms poll also observes commits from other connections.
- Limits: 1 MiB per hook body and serialized envelope, 512 MiB serialized-event
  quota, and a SQLite main-file page ceiling based on `maxDbBytes` (minimum 16
  pages for schema overhead). WAL uses automatic checkpoints and a 4 MiB retained
  journal target; an external reader holding a snapshot can delay truncation.
  These are not a hard combined filesystem quota for DB/WAL/SHM files. Capacity
  errors ask for pruning, free space, or a larger limit. No automatic destructive
  retention is enabled. `prune` supports age/count/bytes and protects running and
  bookmarked rows unless explicitly overridden. Deleted pages are reused, not
  automatically vacuumed.
- Server closure closes its store; CLI signal handlers close connections/store,
  and the launcher forwards shutdown signals. Abrupt termination relies on SQLite
  recovery. Unknown migration versions are rejected without replacing the DB.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| Persist sessions and complete order across restart | Both cases in `shared/studio-resume.test.ts`; packed CLI crash/restart checks compare every stored sequence/JSON row |
| Recover unfinished runs as interrupted | SQLite lifecycle, shared Studio restart, and packed CLI crash checks; provider-scoped and deferred-recovery tests |
| Duplicate ID inserted once; legitimate repeats retained | Reusable RunStore contract, both shared hub cases, duplicate hook after Studio restart |
| Concurrent contiguous sequence allocation | 25 concurrent appends in reusable contract; interleaved writes through two SQLite connections |
| Delete cascades | Contract checks empty replay; lifecycle and clean-package checks directly query events after deletion |
| Retention respects protection and limits | Reusable age/count/bytes pruning tests, bookmark/outcome persistence, event-size/quota failure and batch rollback tests |
| SSE resume followed by ordered live delivery | Both providers over HTTP with header/query cursors, header precedence, metadata appended live; store callback appends during replay and checks exact `[2,3,4]` order |
| Same contracts for both adapters | `run-store-contract.ts` runs against SQLite and each wrapper's store; shared hub and Studio scenarios run for Claude and Codex |
| Migrations and forward fields | Empty database plus version-0 migration-table fixture; version-1 reopen and unknown-version rejection; protocol and SQLite nested-extension round trips |
| Preserve previous consumers | All existing core, adapter, CLI, React and web-component tests; compiled Node imports/types and browser consumer smoke |

## Executed checks

- `npm test`: **251 tests passed, 50 files** on Windows Node 24.16.0.
- `npm run build`: compiled ESM/declarations and CDN passed. `test:package` also
  invokes this complete build through `prepack`.
- `npm run test:package`: blank-project npm install, Node ESM/SQLite persistence,
  declarations, Vite/jsdom, and both packed CLIs passed. Each CLI used temporary
  HOME/USERPROFILE/CWD, installed synthetic hooks, ran doctor/rollback, was killed
  during a live run, restarted, resumed SSE, and verified WAL/indexes/cascade.
- `git diff --check`: passed. Two legacy test helpers initially wrote four
  synthetic doctor rows at the default path. The helpers were isolated and those
  four exact IDs/timestamps were removed; the empty schema file was retained.

The process tests use synthetic provider hooks, not real paid Claude/Codex runs
or a manual browser session. Power loss, network filesystems, Windows ACL
preservation, sustained throughput, and simultaneous writers in separate OS
processes were not tested. Hook tokens continue to rotate on Studio restart;
reinstall hooks to use the new token. The tracked CDN artifact is left at the
baseline; npm packing rebuilds it from the verified sources.
