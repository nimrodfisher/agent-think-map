import type { AnalyzedStep } from "./analysis.js";
export type ChangeClass = "matched" | "inserted" | "missing" | "changed" | "reordered";
export interface AlignmentRow { goodOrdinal?: number; badOrdinal?: number; classification: ChangeClass; confidence: "high" | "medium" | "low"; reason: string }
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
      if(choice===1){const x=a[--i],y=b[--j],exact=x.fingerprint===y.fingerprint;
        const outcome=x.status!==y.status || x.outputClass!==y.outputClass;
        const unknown=x.status==="running" || y.status==="running" || x.identitySource==="legacy-unknown" || y.identitySource==="legacy-unknown";
        const repeated=a.filter(s=>s.fingerprint===x.fingerprint).length>1 || b.filter(s=>s.fingerprint===y.fingerprint).length>1;
        rows.push({goodOrdinal:x.ordinal,badOrdinal:y.ordinal,classification:exact&&!outcome?"matched":"changed",confidence:unknown?"low":repeated?"medium":"high",
          reason:unknown?"Operation identity unavailable or step still running":!exact?"Same operation; normalized input structure differs":outcome?"Same fingerprint; status or output class differs":repeated?"Exact fingerprint; chronological order and parent context break repeated-tool ties":"Exact fingerprint and outcome class"});
      } else if(choice===2) rows.push({goodOrdinal:a[--i].ordinal,classification:"missing",confidence:"medium",reason:"Good step absent from failed sequence"});
      else rows.push({badOrdinal:b[--j].ordinal,classification:"inserted",confidence:"medium",reason:"Additional step in failed sequence"});
    }
    rows.reverse();
    // Only unique, exact, same-parent-context unmatched pairs qualify as moved.
    for(const missing of rows.filter(r=>r.classification==="missing")) {
      const x=a.find(s=>s.ordinal===missing.goodOrdinal)!;
      if(x.identitySource==="legacy-unknown" || a.filter(s=>s.fingerprint===x.fingerprint).length!==1 || b.filter(s=>s.fingerprint===x.fingerprint).length!==1)continue;
      const inserted=rows.find(r=>r.classification==="inserted" && b.find(s=>s.ordinal===r.badOrdinal)?.fingerprint===x.fingerprint);
      if(!inserted)continue;
      const y=b.find(s=>s.ordinal===inserted.badOrdinal)!;
      if(parent(x,good)!==parent(y,bad) || x.status!==y.status || x.outputClass!==y.outputClass)continue;
      Object.assign(missing,{badOrdinal:y.ordinal,classification:"reordered",confidence:"high",reason:"Unique exact fingerprint moved within the same turn and parent context"});
      rows.splice(rows.indexOf(inserted),1);
    }
    result.push(...rows);
  }
  return result;
}
