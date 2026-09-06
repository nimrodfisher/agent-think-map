# Brief 3 human review workflow — real-pair gate PENDING

There are **zero real developer pairs and zero human-reviewed pair results** in this milestone. `fixtures/comparison/structural-pairs.json` contains 24 synthetic structural pairs (12 scenarios for each provider), with authored expected results. They are regression fixtures, not developer evidence. Fingerprint V1 and release stability remain provisional.

The product promise is: **Mark the run that worked. Find the first meaningful divergence in the run that failed. Everything stays local.** A divergence is an observed route difference, not a root-cause claim.

## Blind review, using only local files

After `npm ci` and `npm run build`, prepare one directory per pair. Input is a local JSON event array or the `{items: [...]}` envelope response from the existing local event API. Do not commit private traces. Commands below use example paths; use a private local output directory.

```sh
node scripts/review-comparison.mjs prepare --good /local/good.json --bad /local/bad.json --out /local/review/pair-01 --provenance real_developer_pair --provider codex
node scripts/review-comparison.mjs lock --out /local/review/pair-01
node scripts/review-comparison.mjs reveal --out /local/review/pair-01
node scripts/review-comparison.mjs score --out /local/review/pair-01
```

1. Before `lock`, a developer reads `good.json` and `bad.json` without viewing a Studio comparison. Fill `expected.json`: reviewer identifier, `reviewedBeforeAlgorithm: true`, expected alignment rows, first meaningful divergence, rationale and uncertainties. Ordinals are zero-based chronological nodes, including the initial user node. `run.meta`, deltas and completion events are not separate steps. New user nodes start turns. Record every expected row; omit the absent side for inserted/missing rows.
2. `firstDivergence` is `{ "goodOrdinal": 2, "badOrdinal": 2 }`, `null` when there is no meaningful difference, or `"unknown"` when unresolved. Row classes are `matched`, `inserted` (extra bad step), `missing` (good step absent in bad), `changed`, `reordered`.
3. `lock` creates an exclusive, timestamped `expected.locked.json`. It cannot overwrite an existing lock. `prepare` computes trace hashes but never imports the analyzer. `reveal` first requires that lock and unchanged trace hashes, then writes `actual.json` and `assessment.json` once. Files remain editable by their owner; this is a review aid, not tamper-proof attestation. The script cannot establish that a reviewer actually remained blind or that declared provenance is true.
4. After reveal, inspect actual results in JSON and in Studio: Failed → Compare with Worked → choose baseline → First divergence → inspect both original steps. Fill `assessment.json`: usefulness `yes`/`no`/`unknown`, notes, adjudication, and false alignment classes. Preserve initial judgments; record any adjudicated revision separately.
5. Run `score` to print per-pair alignment precision/recall, class agreement among aligned rows, first-divergence agreement, and usefulness. `null` metrics and `unknown` judgments are unresolved, not passes. Save score output beside the pair when desired. No command changes release status.
6. Use a second independent developer for ambiguous examples. Keep both initial reviews and the eventual adjudication. Record categories such as normalization collision, volatile-value false positive, repeat misalignment, wrong turn, false reorder, legacy identity gap, valid alternative behavior, or incomplete trace. These are review recording categories, not runtime diagnosis rules.
7. After blind review, create separate perturbation cases: change only temp/home paths, IDs and timestamps; then change a meaningful tool, command, HTTP method, SQL table or input structure. Check stability and the expected substitution independently of usefulness.

## Release decision worksheet

Collect 20–30 **real** Worked/Failed pairs across Claude and Codex, covering realistic failures, harmless variations, repeated tools, multiple turns and subagent branches. Keep synthetic cases in a separate scoreboard. For each provider report real pairs reviewed, ambiguous/unreviewed pairs, alignment precision/recall, class agreement, first-divergence agreement (eligible denominator), useful yes/no/unknown counts, and unresolved failure classes. Avoid a single blended pass percentage. Have the release owner record whether developers repeatedly find the result useful, disagreements resolved, and which analyzer/fingerprint version and corpus hashes were reviewed. Until that explicit decision, leave the gate **PENDING**. Do not freeze V1 or proceed to Briefs 4–6 on synthetic results.

## Evidence behind the workflow

Separate deterministic checks from human usefulness and realistic failures to avoid false confidence; preserve ambiguous judgments and inspect transcripts (Demystifying Evals for AI Agents, p. 1). Retain original trace evidence because path semantics can matter in execution even when machine prefixes are normalized (Building Effective Agents, p. 16). Parent context informs repeated steps, but independent subagent branches may be valid alternatives (Anthropic Engineering Playbook: Agents, Harnesses & Infrastructure, p. 2).
