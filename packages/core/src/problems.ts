import { createHash } from "node:crypto";

export interface ProblemOccurrence {
  runId: string; title: string; provider: string; timestamp: number; sequence: number;
}
export interface ProblemGroup {
  id: string; operation: string; message: string; count: number; runCount: number;
  lastSeen: number; occurrences: ProblemOccurrence[];
}
export interface ProblemPage { items: ProblemGroup[]; partial: boolean }
export interface RecordedProblem extends ProblemOccurrence { operation?: string; operationIdentity?: string; message: string }

/** Conservative v1: retain exact error identity. Unknown operations cannot merge across runs. */
export function groupProblems(records: RecordedProblem[], partial = false): ProblemPage {
  const groups = new Map<string, ProblemGroup & { runs: Set<string> }>();
  for (const record of records) {
    const id = createHash("sha256").update(JSON.stringify([1,record.operationIdentity ?? record.operation ?? record.runId,record.message])).digest("hex");
    let group = groups.get(id);
    if (!group) {
      group = {id,operation:record.operation ?? "Unidentified operation",message:record.message,count:0,runCount:0,lastSeen:record.timestamp,occurrences:[],runs:new Set()};
      groups.set(id,group);
    }
    group.count++; group.runs.add(record.runId); group.lastSeen = Math.max(group.lastSeen,record.timestamp);
    group.occurrences.push({runId:record.runId,title:record.title,provider:record.provider,timestamp:record.timestamp,sequence:record.sequence});
  }
  return {partial,items:[...groups.values()].map(({runs,...group}) => ({...group,runCount:runs.size,occurrences:group.occurrences.sort((a,b) => b.timestamp-a.timestamp || b.sequence-a.sequence).slice(0,20)})).sort((a,b) => b.runCount-a.runCount || b.lastSeen-a.lastSeen || a.id.localeCompare(b.id))};
}
