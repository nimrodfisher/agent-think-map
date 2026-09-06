# Run history and agent troubleshooting redesign

Status: core redesign implemented on 2026-09-06. The proposal below remains the longer-term design reference.

Implemented: compact shared Studio shell, system typography, independently scrolling history, quick filters and removable chips, bounded Load more, contextual row actions, a draggable and collapsible desktop sidebar, a compact overlay drawer on narrow screens, browser Back selection restoration, Overview and captured agent handoffs, linked trace selection, server-side recurring-error discovery, original input/error evidence, and error-specific troubleshooting checks.

Verified at handoff: 351 tests passed across 65 files. Production build succeeded. Browser checks covered nested handoff → original trace step, repeated-error counts, and a 390 px responsive layout with no horizontal document overflow. Preview data is synthetic and isolated from the user's trace database.

Current boundaries: problem groups use exact captured operation/error identity, scan at most the newest 10,000 errors with an explicit partial-results notice, and show the 20 newest occurrences per group. Missing operation identities remain separate across runs. Agent relationships are captured within-run parents; cross-run lineage, project metadata, scoped problem queries, persistent troubleshooting notes, and recorded fix-verification workflows remain follow-up work. The five-user timing targets below have not been measured.

Latest UX decisions: comparison UI is removed for now (the backend diff API remains). History keeps the trace visible, using a drawer at widths up to 640 px. Canvas layers are isolated below the drawer to prevent floating cards over run rows. The overlapping Back to recent control is removed. Continue visual testing of narrow viewports, zoom, sidebar resizing, and switching between Runs, Problems, and traces.

## Product direction

Make the primary journey: **find the task → follow the agents → inspect the problem → compare evidence → verify a fix**.

The left sidebar should answer “which run do I want?” The main workspace should answer “what happened?” A Problems view should answer “where has this happened before?” Keep these responsibilities distinct, with deep links connecting them.

Assumption: “across agents” includes subagents within one run and related runs across providers. Both matter; cross-provider lineage must be explicitly recorded or manually linked, never inferred as fact from similar prompts.

## What is causing the clutter

- The screenshot puts explanatory copy, filters, baseline instructions, comparison buttons, and pagination before the first run.
- `studio-history.ts` renders every run with a metadata paragraph, an editable label, and nine action buttons. Browsing becomes repeated form scanning.
- Search already debounces at 250 ms, but the large “Search / refresh” button suggests a separate required step.
- The whole rail scrolls, so navigation controls and results compete for space. The handwritten font reduces the visual distinction between controls, titles, and metadata.
- “Failed” describes both execution status and a human outcome judgment. These are different facts and need different presentation.
- Comparison already exists, but its baseline setup occupies the browsing surface before the user expresses comparison intent.
- The typed run summary has no project, stable agent identity, or cross-run parent relationship. Existing node `parentId` supports relationships within a trace; it is not a complete cross-run model.

## Proposed layout

```text
┌─────────────────────────┬───────────────────────────────────────────────────┐
│ Runs       Problems     │ Fix checkout redirect                  Compare ⋯ │
│ [Search runs…       ]   │ Completed · Outcome: Needs work                  │
│ All  Active  Failed  ★  │ Overview   Trace   Agents                        │
│ Filters (2)             ├────────────────────────────────┬──────────────────┤
│                         │ Coordinator → Researcher       │ Selected step    │
│ Today                   │              → Implementer     │ What happened    │
│ ● Fix checkout redirect │              → Reviewer        │ Evidence         │
│   Claude · 4m ago       │                                │ Next check       │
│ × Investigate timeout   │ Synchronized timeline / map    │ Related problems │
│   Codex · 12m ago       │                                │                  │
│ ✓ Add retry handling    │                                │                  │
│   Claude · 1h ago       │                                │                  │
│                         │                                │                  │
│          Load more      │                                │                  │
└─────────────────────────┴────────────────────────────────┴──────────────────┘
```

Wireframe content is illustrative. Status icons also require accessible text. The inspector opens when needed and becomes a drawer on smaller screens.

## 1. Make history a compact navigation surface

- Start with a 300–340 px resizable rail. Use a system sans-serif font, restrained borders, 14 px titles, and legible secondary text. Keep monospace for technical evidence.
- Keep the heading, search, quick views, and filter control fixed above an independently scrolling list. Put explanatory onboarding in the empty state or Help.
- Use rows around 64–72 px tall at the default density: title, execution status, provider, relative time, and bookmark state. Permit two title lines and expansion at increased text size. Full prompt and metadata belong in the selected run header.
- Move rename, outcome editing, bookmark, and delete into an accessible row menu. Keep the same actions available in the selected run header. No permanent input fields per row.
- Retain automatic search and replace the large submit control with a small, labeled refresh action. Show applied filters as removable chips, with Clear all.
- Initial quick views: All, Active, Failed, Bookmarked. “Failed” initially means execution status only. Label human assessment “Outcome: Worked / Needs work / Unreviewed”; map Needs work to the existing `failed` outcome value.
- Group by date with explicit updated-time ordering. Show a “New activity” indicator instead of moving rows while the user is browsing. Add project grouping only after project identity exists.
- Replace top pagination with bottom “Load more,” using the existing cursor API. Bound retained pages; add virtualization when scale measurements justify it. Never move focus when loading more results.
- Persist query, filters, selected run, and list position across opening traces and comparisons. Make Back return to the prior selection. If a selected run is filtered out, keep its detail open with a clear “Outside current filters” message.
- Show loading, no history, no matches, and request failure as distinct states. Keep retry near the failed operation.

First-release target: at least six readable rows visible at 1280×800 at default zoom, without opening filters. This is a design acceptance target, not a measured improvement.

## 2. Give each run a clear investigation workspace

**Overview:** original request, recorded result, execution status, human outcome, duration, captured cost, agent count, and observed problems. Missing cost or trace coverage says “Unavailable” or “Partial,” never zero or success.

**Trace:** synchronized timeline, existing graph, and inspector selection. Start at a compact overview; provide “First observed error,” “Next problem,” and “Longest step” shortcuts. An observed error is not automatically the root cause, and a recovered error should be identified as recovered only when evidence supports it.

**Agents:** expandable parent/child list, with each agent's role/title, status, elapsed time, delegated task, and returned result when captured. Selecting an agent filters or focuses the timeline and graph without discarding the rest of the run. Breadcrumbs preserve the path back to the coordinator.

Use qualified selection identities: run/session + node + turn or event sequence where necessary. A node ID alone may not be unique across runs or turns. Deep links should restore run, selected step, view, and comparison state.

Cross-run links should identify their origin: recorded handoff, continuation, retry, or user-created related-run link. Similar runs appear as suggestions with their matching reason. Preserve missing-parent and partial-trace states; do not invent a connected tree.

## 3. Add a Problems view for patterns across runs

Switching to Problems replaces the run list with problem groups; it does not add another permanent panel. Default scope is all locally indexed runs, with visible date, provider, and later project filters.

Each group shows a plain-language label, affected-run count, occurrence count, last seen, affected agents/providers, and example evidence. For example: “Tool timeout · 8 runs · 13 occurrences.” Counts must cover the query scope, not only the currently loaded page. Show incomplete indexing explicitly.

Start with deterministic observed signals: recorded node errors, interrupted executions, and known structured error codes. Add suspected repeated-call loops and unusually slow steps later, with thresholds and evidence visible. A repeated call alone is not a retry or a loop. A quiet agent is not necessarily stuck.

Create a dedicated, versioned problem signature from normalized operation identity, structured error class/code when available, and a conservatively normalized error template. The existing input-shape fingerprint helps compare steps but is insufficient as a problem identity. Avoid combining unrelated failures solely because they use the same tool. Preserve original evidence and allow grouping corrections or separation of ambiguous clusters.

Opening a problem shows affected runs, representative steps, recovered and unresolved occurrences, and a troubleshooting checklist. Keep problem review state distinct from whether later runs still exhibit the issue.

## 4. Turn troubleshooting into an evidence-driven workflow

Use the same inspector structure throughout:

1. **Observed:** what failed or differed, which agent and step, and when.
2. **Evidence:** relevant error, inputs/outputs, preceding handoff, and links to original events.
3. **Possible explanation:** a labeled hypothesis with the evidence supporting it and any missing context.
4. **Next check:** a specific inspection or reproducible check, rather than generic advice.
5. **Verify:** select a follow-up run, compare the relevant step, and record whether the issue remains.

Example: a recorded permission-denied error suggests inspecting the path and execution identity. A generic tool failure does not justify a permission diagnosis. Start with curated checklists keyed to observed error categories; automated diagnosis is a later enhancement.

Make “Compare…” an action on the selected run. Open the existing baseline picker on demand, default to runs marked Worked, show readable titles, and explain suggested matches. Do not require outcome labeling merely to inspect evidence. Keep intentional comparison with other outcomes possible.

Reuse the existing aligned comparison and original-step inspection. Rename its entry point to “First detected difference” and retain analyzer confidence and warnings: divergence is evidence to investigate, not a proven cause. Add change navigation and an obvious return to the original trace and list position.

Record troubleshooting notes and links to subsequent runs locally. Marking a problem reviewed or a run Worked must not automatically claim a fix is verified.

## Delivery sequence and engineering boundaries

| Phase | Deliverable | Primary code areas | Completion gate |
|---|---|---|---|
| 1 — Sidebar cleanup | Compact rows, typography, sticky search, quick filters, menus, contextual compare, retained navigation state | `packages/adapters/shared/studio-history.ts`, `studio-diff.ts`, their UI tests | Find, open, annotate, compare, and return using keyboard or pointer; six rows visible at target viewport |
| 2 — Follow agents | Run overview, agent outline, synchronized selection, step deep links; begin with captured within-run parents | `packages/react/src/TraceCanvas.tsx`, `Timeline.tsx`, `Inspector.tsx`, `store.ts`; web-component boundary | Follow a delegation to its error and back; missing parents and duplicate IDs do not select the wrong step |
| 3 — Relate runs and problems | Optional project/agent/lineage fields; indexed problem occurrences; scoped aggregate queries and Problems UI | `packages/protocol/src/index.ts`, adapters, `packages/core/src/run-store.ts`, `sqlite-run-store.ts`, `analysis.ts`, shared API | Group repeated failures across all matching runs; preserve legacy traces and show incomplete coverage |
| 4 — Troubleshoot and verify | Curated checklists, related-success suggestions, notes, verification links, refined comparison | Comparison UI/API, analysis and new local problem/review storage | Reproduce an evidence-backed investigation from problem group through follow-up verification |

Deliver Phase 1 independently; avoid making a much better sidebar wait for new instrumentation. Keep Claude Code and Codex on the shared history implementation. Extract rendering, navigation state, and request handling into testable modules as the surface grows; a framework migration is not a prerequisite.

New optional metadata should include project identity, agent identity/display name, parent run, and delegation step reference with provenance. Adapters populate only what they know. Legacy runs remain valid under “Unknown project/agent.” New derived problem tables/indexes are rebuildable, versioned, and updated on ingestion, deletion, and retention pruning. Do not load all raw traces into the browser to calculate group counts.

Keep search scope honest: today's index includes bounded prompts, labels, model, operation titles, previews, and errors; it does not search every raw input or delta. Matching snippets and step-level search require indexed references and explicit API work.

## Validation

Test the design with five users using a mixed-provider dataset containing 100 runs, similar titles, nested agents, partial traces, and repeated failures. Capture the current baseline first. Proposed targets:

- Locate a specified run in under 15 seconds.
- Reach the relevant failing agent and original error in under 30 seconds.
- Find other runs with the same observed problem in under 30 seconds.
- Compare against a Worked run and explain a detected difference in under 60 seconds.
- At least four of five users complete each task without coaching; record mistakes as well as time.

Validate small screens, 200% text/zoom, long labels, empty/error/loading states, keyboard menus, visible focus, and screen-reader status announcements. Target WCAG 2.2 AA, including minimum target size and focus not obscured. Source: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Engineering checks: retain history mutation/search/pagination and comparison regressions; add meaningful tests for navigation restoration, lineage qualification, problem grouping false matches, aggregate scope, incomplete indexing, and cleanup after deletion. Measure search and switching with 10,000 indexed run summaries and a large nested trace on a documented reference machine; set performance budgets after that measurement.

Prioritize the compact sidebar and contextual comparison first, then the agent outline. Those changes establish a usable investigation path before introducing broader problem analytics.

