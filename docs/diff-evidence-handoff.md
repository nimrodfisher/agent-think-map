# Brief B handoff: backend evidence confidence

Implemented on Brief A commit `11b60d1` (package 0.2.0). B only; no UI or importer changes, publishing, package version bump, endpoints, migrations, or Host/Origin changes.

## Contract for C

- `AlignmentRow` requires `match: 'exact' | 'inferred'` and `matchBasis: MatchBasis`. `MatchBasis` is exported through `agent-think-map/storage`.
- Basis precedence, first applicable wins: `no-corresponding-step`, `step-still-running`, `legacy-identity-unavailable`, `structural-identity-only`, `same-operation-input-shape-differs`, `repeated-fingerprint-order-tie-break`, `exact-fingerprint-status-differs`, `exact-fingerprint`.
- Exact correspondence requires captured identity on both sides, equal fingerprints unique within each side's turn, and neither step running. Outcome differences still allow exact correspondence, but classify as changed. Only exact correspondence with equal status and output class classifies as matched.
- All weaker correspondences are inferred; confidence is medium or low, never high. Missing/inserted rows carry inferred + no-corresponding-step. Reordered rows retain existing move eligibility and use the same evidence checks; a moved fingerprint alone cannot establish exact correspondence.
- Strict structural behavior is intentional: identical user/answer nodes without captured operation identity classify as inferred differences. All 24 existing synthetic fixtures now start with a changed structural user row. Do not hide or relax this in C.
- `firstDivergence` remains the first non-matched row, including inferred structural differences. Warnings include `N of M aligned step pairs are inferred.` where both counts exclude missing/inserted rows and include reordered pairs. The count warning is also present for zero inferred pairs or zero pairs.
- Divergence is an investigative lead, not proof of a cause. No diagnosis rules were added.
- `ANALYZER_VERSION` is 2; fingerprint V1, normalization, and alignment scoring weights are unchanged. Existing cache version invalidation suffices: default get rejects V1, default compare recomputes, and POST/GET preserve fields. Explicit internal version overrides remain available for version tests; HTTP uses current defaults.
- README still says the comparison popup is removed. C owns restoring comparison on demand through the current Studio shell and updating that statement when complete.

## Verified results

- `npm test`: 393 tests passing across 69 files (25 added over A).
- `npm run build`: passed library, declarations, and CDN.
- `git diff --check`: passed.
- Coverage includes all basis precedence, both-side identity checks, per-turn/per-side uniqueness, structural user/answer nodes, repeated/running/legacy/input-shape cases, reordered evidence, warning counts, invariants across existing fixtures, persisted cache round-trip/reopen, fieldless V1 rejection and recomputation, and both providers' POST/GET fields and Host/Origin rejection.
- Fresh worktree dependencies were installed with `npm ci --ignore-scripts --offline`. Tests/build required Windows sandbox escalation for esbuild config access.
- All three tracked `dist` artifacts were backed up before building and restored byte-for-byte afterward, verified with SHA256. No generated artifacts are included in B.

Stop after integrating B. Launch C in a fresh task as planned.
