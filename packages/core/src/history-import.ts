import type { AgentTraceEvent, Provider } from "../../protocol/src/index.js";
import { ImportLiveRunError, type AppendDraft, type RunStore } from "./run-store.js";

/** Paths are transient input handles. Only relativePath is persisted. */
export interface ImportSource { path: string; relativePath: string; runId: string }
export interface ImportDiagnostic {
  type: "diagnostic";
  source: string;
  code: "unreadable-directory" | "excluded-file" | "unreadable-file" | "malformed-json" | "invalid-record";
  line?: number;
}
export interface ImportEvent { type: "event"; eventId: string; payload: AgentTraceEvent }
export interface LocalHistoryImporter {
  provider: Provider;
  discover(root: string): AsyncIterable<ImportSource | ImportDiagnostic>;
  convert(source: ImportSource): AsyncIterable<ImportEvent | ImportDiagnostic>;
}
export interface ImportReport {
  filesSeen: number; filesSkipped: number; directoriesSkipped: number; linesSkipped: number;
  runsCreated: number; runsMerged: number; liveRunsSkipped: number;
  eventsAppended: number; eventsAlreadyPresent: number;
  diagnostics: ImportDiagnostic[]; diagnosticsOmitted: number;
}

/** Import one source at a time. For dry-run, pass an isolated store snapshot. */
export async function importLocalHistory(store: RunStore, importer: LocalHistoryImporter,
  options: { root: string; now?: () => number }): Promise<ImportReport> {
  const report: ImportReport = { filesSeen: 0, filesSkipped: 0, directoriesSkipped: 0, linesSkipped: 0,
    runsCreated: 0, runsMerged: 0, liveRunsSkipped: 0, eventsAppended: 0, eventsAlreadyPresent: 0,
    diagnostics: [], diagnosticsOmitted: 0 };
  const diagnostic = (item: ImportDiagnostic) => {
    if (item.line !== undefined) report.linesSkipped++;
    if (item.code === "unreadable-directory") report.directoriesSkipped++;
    if (report.diagnostics.length < 100) report.diagnostics.push(item); else report.diagnosticsOmitted++;
  };
  const created = new Set<string>(), merged = new Set<string>(), skippedLive = new Set<string>();
  for await (const source of importer.discover(options.root)) {
    if ("type" in source) {
      diagnostic(source);
      if (source.code === "excluded-file") { report.filesSeen++; report.filesSkipped++; }
      continue;
    }
    report.filesSeen++;
    const before = await store.getRun(source.runId);
    const skipLive = () => { skippedLive.add(source.runId); report.filesSkipped++; };
    if (before?.origin === "live") { skipLive(); continue; }
    const drafts: AppendDraft[] = [];
    for await (const item of importer.convert(source)) {
      if (item.type === "diagnostic") { diagnostic(item); continue; }
      drafts.push({ schemaVersion: 1, eventId: item.eventId, provider: importer.provider,
        sessionId: source.runId, timestamp: item.payload.ts, payload: item.payload, origin: "imported",
        importedFrom: source.relativePath });
    }
    if (!drafts.length) { report.filesSkipped++; continue; }
    try {
      // Durable stores make the entire source atomic, including the live-origin check.
      const results = store.appendBatch ? await store.appendBatch(drafts) : await appendSerial(store, drafts);
      const inserted = results.filter(result => result.inserted).length;
      report.eventsAppended += inserted;
      report.eventsAlreadyPresent += results.length - inserted;
      if (inserted) (before ? merged : created).add(source.runId);
      // Metadata-only/duplicate imports do not reopen a previously completed run.
      const latest = drafts.reduce((latest, draft) => Math.max(latest, draft.timestamp), 0);
      await store.markInterrupted(Math.max(options.now?.() ?? Date.now(), latest + 1), importer.provider, [source.runId], "imported");
    } catch (error) {
      if (error instanceof ImportLiveRunError) { skipLive(); continue; }
      throw error; // Storage/validation failures are not corrupt-file skips.
    }
  }
  report.runsCreated = created.size;
  report.runsMerged = [...merged].filter(id => !created.has(id)).length;
  report.liveRunsSkipped = skippedLive.size;
  return report;
}

async function appendSerial(store: RunStore, drafts: AppendDraft[]) {
  const results = [];
  for (const draft of drafts) results.push(await store.append(draft));
  return results;
}
