import type { AgentTraceEvent } from "../../protocol/src/index.js";
import {it,expect} from 'vitest';
import pairs from '../../../fixtures/comparison/structural-pairs.json';
import {compareRuns} from './diff.js';
import {trace} from '../test/comparison-fixture.js';
for(const pair of pairs)it('SYNTHETIC structural golden: '+pair.id,()=>{
 const result=compareRuns('bad','good',pair.badTrace as AgentTraceEvent[],pair.goodTrace as AgentTraceEvent[]);
 expect(result.rows.map(r=>r.classification)).toEqual(pair.expected.classes);
 expect(result.firstDivergence??null).toBe(pair.expected.firstDivergence);
 expect(result.provisional).toBe(true);expect(pair.humanReviewed).toBe(false);
});
it('first divergence ignores run.meta and harmless output literal changes',()=>{
 const good=trace([{name:'read'}],'good'),bad=trace([{name:'read'}],'bad');bad.splice(1,0,{type:'run.meta',runId:'bad',model:'different',ts:5});expect(compareRuns('bad','good',bad,good).firstDivergence).toBeUndefined();
});
it('pure comparison is deterministic including its unpersisted timestamp',()=>{
 const good=trace([{name:'read'}],'good'),bad=trace([{name:'bash'}],'bad');expect(compareRuns('bad','good',bad,good)).toEqual(compareRuns('bad','good',bad,good));
});
