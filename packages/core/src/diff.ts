import { createHash } from "node:crypto";
import { analyzeRun, ANALYZER_VERSION, type RunAnalysis } from "./analysis.js";
import { alignSteps, type AlignmentRow } from "./alignment.js";
import type { AgentTraceEvent } from "../../protocol/src/index.js";
export interface RunDiff { diffId:string; badRunId:string; goodRunId:string; analyzerVersion:number; fingerprintVersion:1; provisional:true; createdAt:number; good:RunAnalysis; bad:RunAnalysis; rows:AlignmentRow[]; firstDivergence?:number; warnings:string[] }
export function compareRuns(badRunId:string,goodRunId:string,badEvents:readonly AgentTraceEvent[],goodEvents:readonly AgentTraceEvent[],analyzerVersion=ANALYZER_VERSION):RunDiff {
  const good=analyzeRun(goodEvents,analyzerVersion),bad=analyzeRun(badEvents,analyzerVersion);
  const rows=alignSteps(good.steps,bad.steps),first=rows.findIndex(row=>row.classification!=="matched");
  return {diffId:createHash("sha256").update(JSON.stringify([badRunId,goodRunId,analyzerVersion,badEvents,goodEvents])).digest("hex"),badRunId,goodRunId,analyzerVersion,fingerprintVersion:1,provisional:true,createdAt:0,good,bad,rows,firstDivergence:first<0?undefined:first,warnings:["Fingerprint V1 is provisional: real developer-pair human validation is pending.",...good.warnings,...bad.warnings]};
}
