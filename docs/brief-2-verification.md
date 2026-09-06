# Brief 2 verification

Baseline: fast-forwarded this isolated worktree to `fb245690f3a06be51677c0e56c7e373a320fa680` before implementation. Local implementation and acceptance only; no push or publication.

## Delivered workflow

Both Studios use `packages/adapters/shared/studio-api.ts` and `studio-history.ts`.
Provider wrappers retain hook authentication, provider ingestion/metadata and the existing SSE/trace renderer. The shared history shows all providers, holds only one 20-run page, and sends search/filter queries to the server. Filters are collapsible and page controls precede the list. Existing session utility exports remain available for callers operating on already bounded arrays; Studio does not use those array filters.

Find a run using search and combined filters, mark Worked/Failed (or clear the outcome), bookmark it and give it a label. Choose baseline is enabled only for Worked rows. The baseline ID is saved as `baseline` in the current page URL, alongside `session`; it is not a global database preference. Clearing/changing that row's outcome or deleting it in this page clears the baseline reference. A future comparison workflow must revalidate URL references against current storage, including changes made in another tab.

Mutations wait for the server before changing rows. Failed requests retain confirmed data and unsaved label text, expose a retry/refresh message, and restore focus. Successful changes reload the first filtered page so a removed match cannot leave the user stranded. Stale search responses are ignored; navigation is disabled during loading; keyboard focus returns to the action, row, or status notice after saves/deletes. The selected trace continues using the original split canvas, inspector, timeline, zoom and SSE resume behavior.

## Storage and search contracts

- Migration 2 creates a materialized `run_search(run_id, document)` table with a cascading foreign key and a `(updated_at DESC, run_id ASC)` index. This uses the brief's materialized-table alternative, not SQLite FTS5. Opening a populated Brief 1 database backfills it in the migration transaction. `RunStore.rebuildSearchIndex()` and `TraceHub.rebuildSearchIndex()` explicitly rebuild it idempotently.
- `run-search.ts` normalizes camel case, Unicode accents, case and punctuation. Query terms are ANDed substring matches over normalized documents. There is no FTS query syntax, ranking, phrase operator or raw SQL interpolation.
- Documents contain up to 4,096 prompt characters, 256 model characters, the short label, and separate 8,192-character budgets for operation names, output previews and errors before normalization. Each operation contributes at most 256 characters; each preview/error contributes at most 1,024. Content beyond those budgets is intentionally not searchable. Tool/MCP/skill/subagent titles supply operation names. `node.delta`, `tool.input`, arbitrary extensions and full raw file/model content are excluded.
- Relevant event appends and label changes update the document within the same transaction; failed batches roll back both events and search. Reindex streams relevant events for one run at a time, excluding delta/input rows in SQL. Deletion/pruning cascade into search and events. Cached provider adapters are discarded if a later hook observes that another caller deleted their stored history.
- Paging uses the existing opaque JSON cursor `[updatedAt, runId]`, URL-encoded over HTTP. There is no OFFSET. Annotation changes preserve the event-derived timestamp, keeping a stable ordering while labeling. Equal timestamps are ordered by SQLite run ID ascending. Filters apply before pagination. Concurrent new trace events can move rows between pages; this is live keyset pagination, not a frozen multi-request snapshot. Refresh to see newly updated rows.
- Materialized substring search scans candidate documents; relevant appends rebuild that run's bounded document by reading its relevant event history. This favors simple transactional correctness over large-corpus search throughput. Sustained ingestion/search throughput has not been benchmarked. Existing physical page/event quotas still apply, so migration or reindex can require free capacity.
- `RunStore` now requires `patchRun` and `rebuildSearchIndex`; third-party injected stores must implement them. `pageSize` takes precedence over the retained `limit` alias. Direct store paging retains the Brief 1 default 100/max 1000; HTTP is stricter.

## HTTP contract (identical in both Studios)

| Route | Result |
| --- | --- |
| `GET /api/runs?q=&provider=&model=&status=&outcome=&bookmarked=&from=&to=&cursor=&limit=` | `{items, nextCursor?}`; default 20, maximum 100; only supply filters in use |
| `GET /api/runs/:id/events?after=4` | `{items}` containing stored envelopes with sequence greater than 4; defaults to 0 |
| `PATCH /api/runs/:id` | Updated run record; JSON accepts independent `outcome`, `bookmarked`, `label` fields |
| `DELETE /api/runs/:id` | 204; subsequent history/search excludes it and event HTTP reads return 404 |
| `GET /sessions` | Compatibility array over the same bounded API, scoped to the wrapper provider; `X-Next-Cursor` header for further pages |
| `DELETE /sessions/:id` | Compatibility adapter to the same delete operation |

Query/model maximum 256 characters; label maximum 120 (trimmed, nullable); ID length 1–512 excluding controls and path separators; cursor maximum 2048; patch body maximum 4096 bytes. Unknown/repeated query keys and unknown patch fields are rejected. Outcomes are `worked`, `failed`, or JSON null; query `outcome=null` finds unlabeled runs. Bookmarks use literal `true`/`false`. Date bounds are inclusive `updated_at` milliseconds or ISO date-times; the date UI converts local day boundaries to milliseconds. Event sequences must be nonnegative safe integers. PATCH requires `application/json`.

All routes run behind the existing bound/configured Host and exact Origin protection, including OPTIONS. No wildcard CORS. Missing Origin remains accepted for local non-browser clients as in Brief 0. Errors use `{error:{code,message}}`: 400 `invalid_request`, 403 `forbidden_host`/`forbidden_origin`, 404 `not_found`, 405 `method_not_allowed`, 415 `unsupported_media_type`, 500 `store_error`. Storage errors do not expose internal details. JSON reads disable caching.

The event endpoint replays one selected run, not the entire run database. It is not event-page bounded; the history listing is. The legacy `/sessions` adapter changed its default/max page size from the previous latest-1000 behavior to 20/100. Codex transcript metadata enrichment now targets the current hook's session instead of scanning up to 1000 sessions during list requests. History refresh is explicit (or triggered by search/filter/action), so list rows do not automatically follow incoming hooks; the selected graph still streams live.

## Acceptance evidence

Executed on Windows, Node **24.16.0**. Runtime minimum remains **22.13.0**.

| Acceptance | Evidence |
| --- | --- |
| Existing Brief 1 runs migrate and reindex | `history-store.test.ts` constructs a populated database using `SCHEMA_V1`, then migrates, adds new runs, rebuilds twice and reopens |
| Normalization, intended fields, exclusion and bounds | `run-search.test.ts`, materialized search tests and both-provider HTTP searches; raw delta sentinel never matches |
| Combined filters and tied timestamp paging | 24 mixed provider runs share timestamps/models and repeat statuses/outcomes; expected codex/completed/worked sequence is `run-01, run-07, run-13, run-19`, paged two at a time |
| Persistent patches and cleanup | Both Studio API cases close/reopen SQLite and Studio, verify Worked/Failed/bookmark/labels, delete, then verify empty search and 404 event reads; store tests directly inspect cascading rows |
| Transactional updates | Failed batch test proves replacement prompt/search terms and oversized event roll back together |
| Security and validation | Every new route tested against foreign/null/spoofed Origins and rebound Host; malformed IDs/cursors, lengths, enums, query repetition, media type and body limits tested |
| UI behavior | Both generated pages run in jsdom: loading, next/previous, server query fields, outcomes, bookmarks, labels, baseline, delete, write/read failures, untrusted text, late responses and focus |
| Real browser | In-app browser against isolated 24-run Studio: 20+4 pages; all five search fields; four combined-filter matches; Worked and Failed actions; bookmark and label; choose baseline and reload persistence; split renderer inspected visually |

- `npm test`: **277 tests in 54 files**, retaining all existing tests (page assertions deliberately migrated to the new history UI; schema/index assertions advanced to migration 2).
- `npm run build`: compiled ESM, declarations and CDN passed; the final package workflow also runs the full build via prepack.
- `npm run test:package`: clean npm pack/install, plain Node ESM, TypeScript consumer, Vite/jsdom consumer, and both packed CLIs' isolated install/doctor/rollback/crash/restart/SSE/SQLite checks passed.
- `git diff --check`: checked before commit. Generated tracked CDN/style artifacts are restored to the baseline, following Brief 1's artifact policy; packing rebuilds them.

For a disposable browser fixture after `npm ci` and `npm run build`, run `node node_modules/vite-node/vite-node.mjs scripts/preview-history.ts`. It creates a temporary database and prints a loopback URL. Synthetic restart/deletion acceptance is automated in `studio-history-api.test.ts` for both providers; the browser check used reload, not an independently repeated process-restart exercise. No real paired corpus exists, and no paid provider sessions were used. Execution status is preserved from Brief 1 (node errors do not automatically infer a failed run or user outcome). Subsequent hooks can recreate a deleted active run. No alignment, diff, automatic diagnosis, cloud/team history or orchestration was implemented. The human validation gate after Brief 3 remains outstanding.
