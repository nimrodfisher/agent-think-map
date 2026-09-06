# Work summary — September 6, 2026

## Product direction

Moved Agent Think Map toward a local control plane for inspecting agent work,
finding useful historical runs, labeling outcomes, and comparing a failed run
with one that worked. The concrete product promise is:

> Mark the run that worked. Find the first meaningful divergence in the run that failed. Everything stays local.

This is a trace inspection and comparison workflow. It does not claim agent
orchestration, automatic remediation, or proven root-cause diagnosis.

## Implementation workflow

Read all eight supplied briefs and executed Briefs 0, 0B, 1, 2, and the
implementable portion of Brief 3 in five fresh Codex tasks. Each task received
its complete brief, checked acceptance criteria, and committed locally before
the next task began. The verified commits were integrated sequentially into
`codex/instinct-improvements`.

| Brief | Delivered | Integrated commit |
| --- | --- | --- |
| 0 | Local Studio security: random per-process hook tokens, rejection before body parsing, exact Origin and Host checks, removal of wildcard CORS, and installation against a running server's token | `75d4324` |
| 0B, installation | Atomic configuration writes, timestamped backups, selected/latest rollback preserving unrelated edits, and doctor verification through the installed hook path | `37e3e92` |
| 0B, packaging | Compiled ESM JavaScript and declarations, explicit ESM-only exports, and clean-room packed-package consumer checks | `b0a294f` |
| 1 | Versioned event envelopes, SQLite RunStore, shared provider-neutral hub, duplicate protection, retention controls, restart recovery, and ordered SSE resume | `fb24569` |
| 2 | Shared paginated history API/UI, bounded search, combined filters, labels, bookmarks, Worked/Failed outcomes, and explicit baseline selection | `9d4387c` |
| 3 | Semantic operation capture, provisional fingerprints, turn-aware alignment, comparison caches/APIs, side-by-side routes, linked selection/scrolling, first-divergence navigation, and human-review tooling | `46547a3` |

The prepared installation and packaging maintenance patches were not available
in the repository or Downloads. Their required behavior was implemented
directly. The existing positioning patch was retained as a reference rather
than reapplied over later changes.

## Verification

- Final integrated checkout: **339 tests passed in 62 test files**.
- Final integrated checkout: **`npm run build` passed**, producing compiled ESM,
  declarations, and the browser CDN bundle.
- Milestone clean-package checks passed: packed tarball installation in a blank
  project, Node imports, declarations, explicit CommonJS rejection, Vite/browser
  consumption, and both packed CLI workflows.
- Isolated CLI checks covered install, doctor, rollback, crash/restart recovery,
  SQLite persistence, and SSE resume for Claude Code and Codex.
- Real-browser checks covered security, history with 24 synthetic runs, and
  comparison navigation, paired highlighting, original-event inspection,
  sticky side headings, and linked scrolling.
- Added **24 synthetic structural comparison pairs**, explicitly marked as
  synthetic and not human-reviewed.
- `git diff --check` passed after integration. Generated tracked CDN artifacts
  were restored to their committed versions, following the milestone artifact
  policy; building/packing regenerates them from source.

Verification ran on Windows with Node **24.16.0**. The package now requires
Node **22.13.0 or later** and uses built-in `node:sqlite`. Windows CI coverage
was added for Node 22.13.0 and 24.x; those remote jobs were not claimed as locally
executed results.

## Important limits and the agreed stopping point

The user explicitly retained the checkpoint after Brief 3 and confirmed that
no real Worked/Failed paired corpus exists yet. Therefore:

- Fingerprint/analyzer V1 remains **provisional**.
- There are **zero real developer pairs and zero human-reviewed pairs** in this
  milestone. Synthetic tests are not evidence of developer usefulness.
- The next step is to collect and blindly review **20–30 real Worked/Failed
  pairs across Claude Code and Codex**, then assess alignment, first divergence,
  and usefulness separately.
- **Briefs 4–6 were not started**: deterministic diagnosis, redacted export, and
  structural regression fixtures/CLI remain deferred until that gate passes.
- Universal replay, cloud upload, and automatic root-cause claims remain out of
  scope. No npm version was published.

One Brief 0 manual check remained unverified: automatic approval review blocked
deleting a synthetic Codex session through the browser, citing insufficient
delegated authorization. Automated Codex deletion tests passed. Other limits,
including lexical normalization collisions, large-run performance, and storage
quota details, are recorded in the milestone verification documents.

Hook tokens rotate when Studio restarts; installed hooks need to be refreshed
with the new token. Doctor verifies synthetic hook transport, not real-agent
permissions or consent.

## Existing work preserved and included in this handoff

The pre-existing `package.json` bin-path normalization, root
`agent-think-map-positioning.patch`, and `docs/codex-social.gif` were preserved
through all integrations. At the user's subsequent request to commit and push
all work, these files are included alongside this summary. They are not
presented as newly authored milestone work.

## Detailed evidence and next steps

- [Installation and package verification](brief-0b-verification.md)
- [Storage and SSE verification](brief-1-verification.md)
- [History and labels verification](brief-2-verification.md)
- [Comparison verification and limitations](brief-3-verification.md)
- [Human review workflow and release decision worksheet](brief-3-human-review.md)

The review helper supports `prepare`, `lock`, `reveal`, and `score`. It preserves
unknown judgments and never grants release approval automatically. Follow the
human-review document before proceeding to Briefs 4–6.
