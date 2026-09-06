# Brief C handoff: on-demand Studio comparison

Implemented on Brief B `18402dcf25d7acc5505ebada734a5d1c112a2910`, package 0.2.0. Shared UI for Claude Code and Codex only; no importer, analyzer, alignment, fingerprint, diff API, hooks, viewer source, demo, packaging, or version changes. Nothing published.

## Behavior

- Selected-run Compare… always opens a searchable, paginated Worked-baseline picker. Other outcomes require explicit confirmation; the candidate is excluded. Compare workspace tab retains an existing comparison. Modal Escape/Tab, focus return, inert cleanup, and request invalidation cover errors and navigation.
- Baseline left / Candidate right use actual outcomes and titles, including successful metadata edits. Every alignment row appears in the rail and both panes, with linked selection and proportional scrolling. Inferred evidence uses text and dashed borders, including absent counterparts. All eight evidence bases and backend warnings are visible.
- First detected difference uses the API index unchanged, including strict inferred structural user steps. Summary states classification, confidence, and evidence strength. Original-step inspection reads the appropriate run endpoint and follows analyzer node creation, ordinal/turn ordering, restart boundaries, synthetic users, and reducer ID deduplication; rendered envelopes retain sequence context.
- Comparison retains the trace node and loaded history. Back to trace clears baseline and restores the saved node/list scroll. Other workspace tabs retain comparison. Run changes preserve the prior comparison browser-history entry before invalidation. Deletion, Problems, and browser Back cancel stale results. Direct URLs restore after the one initial history fetch; unavailable baselines show a notice in both history and the workspace header.
- Narrow comparison entry closes the history drawer, fixing an overlap found during real browser QA.

## Validation

- `npm test`: **413 passed across 69 files**. Comparison tests: 22 (replacing two absence tests). Existing history, sidebar, and investigation tests unchanged and passing.
- Coverage includes picker filtering/pagination/confirmation, modal keyboard/focus/inert cleanup, actual metadata and edits, inferred/exact/missing evidence, all basis labels, warning/XSS rendering, first difference enabled/disabled, trace restoration, direct/invalid URLs, browser-history traversal, pending-result invalidation, deletion, empty selection, and repeated-node/synthetic-user original inspection.
- `npm run build`: passed library, declarations, and CDN. All three tracked dist files backed up before builds, restored byte-for-byte, and verified with SHA256. No generated artifacts committed.
- `git diff --check`: passed.
- Real in-app browser QA used only `scripts/preview-history.ts` synthetic temporary databases: 1280×800 and 390×844. Verified picker, both comparison panes, all four fixture rows, first structural difference highlighting all three linked elements, original synthetic-user envelope, and return to trace. Document width remained 390 at the narrow viewport; no horizontal document overflow at either size. Verified narrow direct-link drawer fix after the final change. Temporary tabs closed, viewport reset, preview processes stopped.

## Boundaries

Alignment remains provisional and is an investigative lead, not proven causation. Original inspection displays captured event envelopes, not a reconstructed historical canvas. Narrow layouts retain side-by-side independently scrolling panes and a horizontally scrolling alignment rail; long warnings and evidence use workspace scrolling. Browser QA exercised the shared UI through the Codex preview server; both provider page variants are covered by the behavior suite.
