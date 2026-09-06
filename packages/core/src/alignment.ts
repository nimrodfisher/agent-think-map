import type { AnalyzedStep } from "./analysis.js";
export type ChangeClass = "matched" | "inserted" | "missing" | "changed" | "reordered";
export type MatchBasis = "no-corresponding-step" | "step-still-running" | "legacy-identity-unavailable" | "structural-identity-only" | "same-operation-input-shape-differs" | "repeated-fingerprint-order-tie-break" | "exact-fingerprint-status-differs" | "exact-fingerprint";
export interface AlignmentRow { goodOrdinal?: number; badOrdinal?: number; classification: ChangeClass; match: "exact" | "inferred"; matchBasis: MatchBasis; confidence: "high" | "medium" | "low"; reason: string }
const reasons: Record<MatchBasis, string> = {
  "no-corresponding-step": "No corresponding step",
  "step-still-running": "At least one step is still running",
  "legacy-identity-unavailable": "Captured operation identity unavailable on a legacy step",
  "structural-identity-only": "Correspondence uses structural identity without captured operation identity",
  "same-operation-input-shape-differs": "Same operation; normalized input structure differs",
  "repeated-fingerprint-order-tie-break": "Repeated fingerprint; chronological order and parent context break ties",
  "exact-fingerprint-status-differs": "Unique captured fingerprint; status or output class differs",
  "exact-fingerprint": "Unique captured fingerprint and outcome class",
};
function evidence(x: AnalyzedStep, y: AnalyzedStep, repeated: boolean): Pick<AlignmentRow, "match" | "matchBasis" | "confidence" | "reason"> {
  // Ordered from weakest evidence: earlier conditions win when several apply.
  const matchBasis: MatchBasis = x.status === "running" || y.status === "running" ? "step-still-running"
    : x.identitySource === "legacy-unknown" || y.identitySource === "legacy-unknown" ? "legacy-identity-unavailable"
    : x.identitySource !== "captured" || y.identitySource !== "captured" ? "structural-identity-only"
    : x.fingerprint !== y.fingerprint ? "same-operation-input-shape-differs"
    : repeated ? "repeated-fingerprint-order-tie-break"
    : x.status !== y.status || x.outputClass !== y.outputClass ? "exact-fingerprint-status-differs" : "exact-fingerprint";
  const match = matchBasis === "exact-fingerprint" || matchBasis === "exact-fingerprint-status-differs" ? "exact" : "inferred";
  return {match, matchBasis, confidence: match === "exact" ? "high" : matchBasis === "step-still-running" || matchBasis === "legacy-identity-unavailable" ? "low" : "medium", reason: reasons[matchBasis]};
}
const sameOperation = (a:AnalyzedStep,b:AnalyzedStep) => a.kind===b.kind && a.operation.name===b.operation.name && a.operation.server===b.operation.server;
/** Weighted sequence alignment bounded per turn. Sides are always good -> bad. */
export function alignSteps(good: readonly AnalyzedStep[], bad: readonly AnalyzedStep[]): AlignmentRow[] {
  const result:AlignmentRow[]=[];
  const parentMaps = new Map([good,bad].map(steps=>[steps,new Map(steps.map(s=>[s.ordinal,s.fingerprint]))]));
  const parent = (s:AnalyzedStep,steps:readonly AnalyzedStep[]) => s.parentOrdinal === undefined ? undefined : parentMaps.get(steps)?.get(s.parentOrdinal);
  const turns=[...new Set([...good,...bad].map(s=>s.turnOrdinal))].sort((a,b)=>a-b);
  for(const turn of turns) {
    const a=good.filter(s=>s.turnOrdinal===turn),b=bad.filter(s=>s.turnOrdinal===turn);
    if ((a.length+1)*(b.length+1)>4_000_000) throw new Error("Comparison turn exceeds 4 million alignment cells; split the run into smaller turns");
    const width=b.length+1, scores=new Float64Array((a.length+1)*width), choices=new Uint8Array(scores.length);
    for(let i=1;i<=a.length;i++){scores[i*width]=-4*i;choices[i*width]=2;}
    for(let j=1;j<=b.length;j++){scores[j]=-4*j;choices[j]=3;}
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
      const x=a[i-1],y=b[j-1],same=sameOperation(x,y),exact=x.fingerprint===y.fingerprint;
      const context=parent(x,good)===parent(y,bad)?1:0;
      const diagonal=same?scores[(i-1)*width+j-1]+(exact?12:2)+context:-Infinity;
      const missing=scores[(i-1)*width+j]-4,inserted=scores[i*width+j-1]-4,index=i*width+j;
      scores[index]=Math.max(diagonal,missing,inserted);
      choices[index]=diagonal===scores[index]?1:missing===scores[index]?2:3;
    }
    const rows:AlignmentRow[]=[];let i=a.length,j=b.length;
    while(i||j) {
      const choice=choices[i*width+j];
      if(choice===1){const x=a[--i],y=b[--j];
        const repeated=a.filter(s=>s.fingerprint===x.fingerprint).length>1 || b.filter(s=>s.fingerprint===y.fingerprint).length>1;
        const pairEvidence=evidence(x,y,repeated);
        rows.push({goodOrdinal:x.ordinal,badOrdinal:y.ordinal,classification:pairEvidence.matchBasis==="exact-fingerprint"?"matched":"changed",...pairEvidence});
      } else if(choice===2) rows.push({goodOrdinal:a[--i].ordinal,classification:"missing",match:"inferred",matchBasis:"no-corresponding-step",confidence:"medium",reason:"Good step absent from failed sequence"});
      else rows.push({badOrdinal:b[--j].ordinal,classification:"inserted",match:"inferred",matchBasis:"no-corresponding-step",confidence:"medium",reason:"Additional step in failed sequence"});
    }
    rows.reverse();
    // Preserve move eligibility; evidence below determines exact vs inferred correspondence.
    for(const missing of rows.filter(r=>r.classification==="missing")) {
      const x=a.find(s=>s.ordinal===missing.goodOrdinal)!;
      if(x.identitySource==="legacy-unknown" || a.filter(s=>s.fingerprint===x.fingerprint).length!==1 || b.filter(s=>s.fingerprint===x.fingerprint).length!==1)continue;
      const inserted=rows.find(r=>r.classification==="inserted" && b.find(s=>s.ordinal===r.badOrdinal)?.fingerprint===x.fingerprint);
      if(!inserted)continue;
      const y=b.find(s=>s.ordinal===inserted.badOrdinal)!;
      if(parent(x,good)!==parent(y,bad) || x.status!==y.status || x.outputClass!==y.outputClass)continue;
      const pairEvidence=evidence(x,y,false);
      Object.assign(missing,{badOrdinal:y.ordinal,classification:"reordered",...pairEvidence,reason:`Moved within the same turn and parent context. ${pairEvidence.reason}`});
      rows.splice(rows.indexOf(inserted),1);
    }
    result.push(...rows);
  }
  return result;
}
