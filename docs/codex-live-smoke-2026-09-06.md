# Real Codex smoke check — 2026-09-06

Current result: **the two reported defects are fixed for new captures, and the real Codex CLI recheck passes.** The original failed check is retained below.

## Fix and recheck

- A new SessionStart no longer opens a placeholder run. UserPromptSubmit supplies the real run prompt and the single initial User node; resumed sessions retain their existing history.
- The forwarding command loads a compiled entry in its existing Node process, without a per-event TypeScript loader or transcript scan. Studio acknowledges durable ingestion before optional metadata enrichment. Network delivery is bounded, and failures produce a diagnostic rather than being silently discarded. This removes avoidable work from the short hook deadline; the original missing deliveries did not include enough diagnostics to prove their precise cause.
- Startup probe: old path 756–952 ms; compiled path 157–217 ms. In the clean installed package, all six lifecycle deliveries completed in 171–247 ms, each enforced with a three-second process deadline.
- Real run A: `01a07744-70d3-7fd1-8382-86b6f857254e`, command `Write-Output ATM_CODEX_FIXED_A`, exit 0.
- Real run B: `01a07745-0bdd-72c0-96aa-1ec929e8dcbc`, command `Write-Output ATM_CODEX_FIXED_B; Start-Sleep -Seconds 8`, exit 0. Studio was observed with five events and running status before completion.
- Both runs finished with **11 persisted events**, including one tool completion and one explicit run completion, correct searchable prompts, and no extra User node. The browser showed the real tool input/output and a three-node prompt/tool/answer trace.
- Marked A Worked through the browser and compared B against it. Both tool steps showed completed evidence; the stale-running warning was absent. First detected difference navigation worked. After restarting Studio, both completed records, event counts, prompts, and A's Worked outcome remained intact.
- Validation: **415 tests across 69 files**, `npm run build`, `npm run test:package`, and `git diff --check` passed. The package check includes Node/TypeScript/Vite consumers and both providers' install, doctor, rollback, restart, persistence, and SSE checks. All tracked build artifacts were restored byte-for-byte from pre-build backups.

Scope: real runs used the same reviewed-hook invocation-only trust option described below. First-time trust/consent dialogs and the Desktop UI are still outside this check. Historical runs from the failed check were not rewritten or given fabricated completion events. No publication or version bump.

## Original check (before the fix)

Result at that time: **partial pass; live capture was not reliable enough for an unqualified end-to-end claim.**

Tested local source commit `be5ffb2` with the pending README update, Windows, Codex CLI 0.153.3, and Studio at `http://127.0.0.1:3335`. No synthetic payloads were used for the two real runs below. The separate `--doctor` transport check passed but is not counted as real capture evidence. Existing generated artifacts were preserved; this check used the existing canvas bundle and current Studio source.

## Setup

- Existing user and project hooks referenced an obsolete tokenless endpoint. Ran `node bin/cli.mjs codex --install --project --no-open` to refresh the project hooks. User hooks and existing enabled capture consent were retained.
- The first isolated CLI attempts using `--ignore-user-config` did not appear in Studio. One read-only attempt also had its shell command rejected. These are not passes.
- Successful real command executions used normal Codex configuration, `--approve-for-me`, and the documented invocation-only `--dangerously-bypass-hook-trust` option after inspecting the forwarding hooks. First-time hook trust and consent dialogs were therefore **not** validated. No approval/sandbox bypass for tool execution was used.

## Observed results

| Check | Result |
| --- | --- |
| Real run C: `01a0772f-ea70-7872-9e72-6518ffe13b3a` | Codex executed `Write-Output ATM_CODEX_LIVE_OK`, exit 0. Studio persisted 13 events, a completed tool and run, the actual prompt and answer, model, and usage. |
| Browser trace inspection | Actual command input and `ATM_CODEX_LIVE_OK` output were visible in the inspector. |
| Outcome and restart persistence | Marked run C Worked through the browser. Restarted Studio; the same 13 events, completed status, and Worked outcome remained. |
| Real run D: `01a07732-d944-7931-be4b-4637b1e5f0ae` | Codex executed `Write-Output ATM_CODEX_LIVE_SECOND; Start-Sleep -Seconds 8`, exit 0, and returned its answer. Studio retained only 11 events: tool completion and run completion were absent. The tool and run still appeared running after the CLI exited. |
| Real-run comparison | Worked baseline picker found run C. Baseline/Candidate panes rendered C against D. First detected difference navigated to the inferred structural row. Warnings correctly reflected the candidate's missing completion evidence. This does not validate alignment usefulness or causality. |

## Defects to resolve before promotion

1. **Placeholder prompt becomes permanent run title.** Both runs began with `run.started` carrying `(session)` when SessionStart arrived before UserPromptSubmit. The actual prompt became a second User node. History retained `(session)`, and searching the unique prompt marker did not find the first run. The underlying prompt remains captured in the trace.
2. **Completion delivery is unreliable.** Run D lacks the tool's `node.completed` and the session's `run.completed` despite the real command and CLI completing successfully. The cause is not yet established; do not assume it is an analyzer or rendering bug. Investigate hook execution, forwarding, timeouts, and ingestion with correlated delivery evidence.

This verifies a real CLI capture path, browser inspection, persistence, annotation, and comparison rendering with limitations. It does not establish a clean desktop onboarding flow, all tool types, failure capture, subagents, or an npm release. The current implementation commits and pending README still need publication separately.
