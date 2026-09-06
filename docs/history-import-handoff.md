# Brief A handoff: Claude Code local history

Implemented against `56e323b` (0.2.0). This commit completes A only. Implement B in a fresh session against this committed state, followed by C in another fresh session after B passes. No publishing or version bump.

## Available behavior

- `node bin/cli.mjs claude --import-history [--history-root <path>] [--dry-run]` imports main-session UUID-named JSONL files. The default root is `~/.claude/projects`.
- The command exits without starting Studio, building assets, or installing/refreshing hooks. Dry-run uses a private temporary database/WAL copy to populate an in-memory simulation; the temporary copy is removed. It never opens the user's database with SQLite, avoiding even read-only WAL sidecar creation. A changing snapshot is retried up to three times, then reported as an error.
- `LocalHistoryImporter`, conversion events/diagnostics, and `importLocalHistory` are exported from `agent-think-map/storage`. `ClaudeCodeHistoryImporter` and its default root are exported from `agent-think-map/claude-code`.
- Migration v4 adds run origin. Existing runs are Live. Imported appends are rejected transactionally if live evidence exists; a new live event promotes an imported run to Live. Future imports then skip it. Historical overlap with live continuation is deliberately not reconciled.
- `markInterrupted(before, provider?, runIds?, origin?)` preserves old callers. Imports supply both IDs and imported origin, protecting unrelated or concurrently promoted runs.
- Deterministic imported event IDs derive from session ID, a hash of the record UUID (or physical line number), and block/event slots. Repeat imports deduplicate; appended records extend an imported session. Metadata IDs include their source boundary and value digest.
- Source paths stored on envelopes are relative to the history root. Previews are redacted and bounded; tool inputs use existing redaction. Corrupt input produces bounded diagnostics and counts; storage failures propagate.
- Main-transcript Task/sidechain relationships are retained. Separate subagent transcripts are excluded. Only explicit session-end records complete a run; assistant `end_turn` and EOF do not. Otherwise imported sessions become interrupted, with human outcome unchanged.
- Both Studios show an Imported marker and an Origin dropdown. `/api/runs?origin=live|imported` filters; invalid/repeated values return 400.

## Validation

- `npm test`: 368 tests passed across 68 files (17 added).
- `npm run build`: passed (library, declarations, and CDN).
- `git diff --check`: passed.
- Tests cover repeat/growing imports, malformed and unreadable files, missing/opaque UUIDs, tools and Task sidechains, conservative completion, live races and promotion, provenance migration/filtering, and CLI dry-run preservation (including open-database WAL contents).
- Existing modified `dist/element.cdn.js`, `dist/styles.css`, and untracked `agent-think-map-0.1.2.tgz` belong to the user. Builds preserve the tracked artifact bytes; do not stage them.

## Next session: B, backend evidence only

The analyzer remains version 1 and the fingerprint remains V1. Do not change A or Studio UI in B.

1. Add required `match: "exact" | "inferred"` and exported `MatchBasis` to every alignment row.
2. Basis vocabulary and precedence: `no-corresponding-step`, `step-still-running`, `legacy-identity-unavailable`, `structural-identity-only`, `same-operation-input-shape-differs`, `repeated-fingerprint-order-tie-break`, `exact-fingerprint-status-differs`, `exact-fingerprint`.
3. Exact requires captured identity on both sides, unique fingerprints in the turn, and neither step running. Only exact with equal outcome classes can be `matched`. Keep inferred confidence below high. Apply the same strict conditions to exact reordered pairs.
4. The user explicitly chose strict structural behavior: identical user/answer steps without captured operation identity can still be inferred differences. Do not silently relax this.
5. Add a warning counting inferred paired rows out of all paired rows, excluding inserted/missing rows. Keep firstDivergence as the first non-matched row.
6. Bump analyzer version to 2, keep fingerprint/scoring unchanged, and verify cached diff JSON and POST/GET APIs retain every evidence field. Stale v1 diffs must not be served.
7. Test evidence precedence, invariants, structural/repeated/running and reordered cases, warning counts, API round-trip, and cache invalidation. Run the full suite, build, and diff check; commit B separately and leave a C handoff.

C subsequently restores the dormant comparison module through the current shell, consumes B's evidence fields, preserves trace/list/URL state, and keeps comparison on demand. Its implementation belongs in the next fresh session after B, not in B.
