import {it,expect} from 'vitest';
import {analyzeRun} from './analysis.js';
import {alignSteps} from './alignment.js';
import {trace, type Spec} from '../test/comparison-fixture.js';
const align=(a:Spec[],b:Spec[])=>alignSteps(analyzeRun(trace(a,'good')).steps,analyzeRun(trace(b,'bad')).steps);
it('substitutes input shape for same operation',()=>expect(align([{name:'read',input:{path:'a.ts'}}],[{name:'read',input:{path:'a.py'}}]).map(r=>r.classification)).toEqual(['changed','changed']));
it('inserts and removes distinct operations',()=>{expect(align([],[{name:'bash'}]).at(-1)?.classification).toBe('inserted');expect(align([{name:'read'}],[]).at(-1)?.classification).toBe('missing');});
it('reports only unique exact same-context reorders',()=>{const a=[{name:'read'},{name:'bash'}];expect(align(a,[...a].reverse()).some(r=>r.classification==='reordered')).toBe(true);});
it('repeated tools are deterministic and confidence is qualified',()=>{const a=[{name:'read'},{name:'read'},{name:'bash'}];const b=[{name:'read'},{name:'bash'}];expect(align(a,b)).toEqual(align(a,b));expect(align(a,b).some(r=>r.confidence==='medium')).toBe(true);});
it('never matches across user turns',()=>{const rows=align([{name:'read'},{name:'bash',turn:1}],[{name:'bash'},{name:'read',turn:1}]);expect(rows.filter(r=>r.classification==='matched')).toHaveLength(0);});
it('uses parent context for branch repeats without claiming graph alignment',()=>{const a=[{name:'branch-a'},{name:'read',parent:0},{name:'branch-b'},{name:'read',parent:2}];const b=[{name:'branch-b'},{name:'read',parent:0}];const rows=align(a,b);expect(rows.find(r=>r.badOrdinal===2)?.goodOrdinal).toBe(4);});
it('bounds alignment allocation for a pathological single turn',()=>{
 const steps=Array.from({length:2000},(_,ordinal)=>({...analyzeRun(trace([{name:'read'}])).steps[1],ordinal}));
 expect(()=>alignSteps(steps,steps)).toThrow(/alignment cells/);
});
