import type { AgentTraceEvent } from "../../protocol/src/index.js";
import {it,expect} from 'vitest';
import pairs from '../../../fixtures/comparison/structural-pairs.json';
import {compareRuns} from './diff.js';
import {trace} from '../test/comparison-fixture.js';
for(const pair of pairs)it('SYNTHETIC structural golden: '+pair.id,()=>{
 const result=compareRuns('bad','good',pair.badTrace as AgentTraceEvent[],pair.goodTrace as AgentTraceEvent[]);
 expect(result.rows.map(r=>r.classification)).toEqual(pair.expected.classes);
 expect(result.firstDivergence??null).toBe(pair.expected.firstDivergence);
 for(const row of result.rows){
  const good=result.good.steps.find(s=>s.ordinal===row.goodOrdinal),bad=result.bad.steps.find(s=>s.ordinal===row.badOrdinal);
  if(!good || !bad){expect(row).toMatchObject({match:'inferred',matchBasis:'no-corresponding-step'});continue;}
  const exact=good.identitySource==='captured' && bad.identitySource==='captured' && good.status!=='running' && bad.status!=='running' && good.fingerprint===bad.fingerprint && result.good.steps.filter(s=>s.turnOrdinal===good.turnOrdinal && s.fingerprint===good.fingerprint).length===1 && result.bad.steps.filter(s=>s.turnOrdinal===bad.turnOrdinal && s.fingerprint===bad.fingerprint).length===1;
  expect(row.match).toBe(exact?'exact':'inferred');
  if(row.match==='inferred'){expect(row.confidence).not.toBe('high');expect(row.classification).not.toBe('matched');}
  if(row.classification==='matched'){expect(row.matchBasis).toBe('exact-fingerprint');expect(good.status).toBe(bad.status);expect(good.outputClass).toBe(bad.outputClass);}
 }
 expect(result.provisional).toBe(true);expect(pair.humanReviewed).toBe(false);
});
it('metadata changes preserve rows and strict structural first divergence',()=>{
 const good=trace([{name:'read'}],'good'),bad=trace([{name:'read'}],'bad');bad.splice(1,0,{type:'run.meta',runId:'bad',model:'different',ts:5});const result=compareRuns('bad','good',bad,good);expect(result.firstDivergence).toBe(0);expect(result.rows).toEqual(compareRuns('bad','good',good,good).rows);
});
it('pure comparison is deterministic including its unpersisted timestamp',()=>{
 const good=trace([{name:'read'}],'good'),bad=trace([{name:'bash'}],'bad');expect(compareRuns('bad','good',bad,good)).toEqual(compareRuns('bad','good',bad,good));
});
