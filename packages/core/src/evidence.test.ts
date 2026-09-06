import {it, expect} from 'vitest';
import {analyzeRun, type AnalyzedStep} from './analysis.js';
import {alignSteps, type MatchBasis} from './alignment.js';
import {compareRuns} from './diff.js';
import {trace} from '../test/comparison-fixture.js';
const step=(patch:Partial<AnalyzedStep>={}):AnalyzedStep=>({...analyzeRun(trace([{name:'read'}])).steps[1],ordinal:0,parentOrdinal:undefined,...patch});
const cases: [string, Partial<AnalyzedStep>, Partial<AnalyzedStep>, boolean, MatchBasis][] = [
 ['running before legacy, shape, repeats and outcome',{status:'running',identitySource:'legacy-unknown'},{fingerprint:'other',status:'failed'},true,'step-still-running'],
 ['legacy before structural, shape, repeats and outcome',{identitySource:'legacy-unknown'},{identitySource:'structural',fingerprint:'other',status:'failed'},true,'legacy-identity-unavailable'],
 ['structural before shape, repeats and outcome',{identitySource:'structural'},{fingerprint:'other',status:'failed'},true,'structural-identity-only'],
 ['shape before repeats and outcome',{}, {fingerprint:'other',status:'failed'},true,'same-operation-input-shape-differs'],
 ['repeats before outcome',{}, {status:'failed'},true,'repeated-fingerprint-order-tie-break'],
 ['status before exact',{}, {status:'failed'},false,'exact-fingerprint-status-differs'],
 ['output class before exact',{}, {outputClass:'json-object'},false,'exact-fingerprint-status-differs'],
 ['unique captured completed identity',{}, {},false,'exact-fingerprint'],
];
for(const [name,x,y,repeated,basis] of cases)it('basis precedence: '+name,()=>{
 const a=step(x),b=step(y);
 const rows=alignSteps(repeated?[a,{...a,ordinal:1}]:[a],repeated?[b,{...b,ordinal:1}]:[b]);
 for(const row of rows){expect(row.matchBasis).toBe(basis);expect(row.match).toBe(basis.startsWith('exact-')?'exact':'inferred');expect(row.classification).toBe(basis==='exact-fingerprint'?'matched':'changed');if(row.match==='inferred')expect(row.confidence).not.toBe('high');}
});
it('missing and inserted outrank all step evidence',()=>{
 const a=step({status:'running',identitySource:'legacy-unknown'});
 for(const row of [...alignSteps([a],[]),...alignSteps([],[a])])expect(row).toMatchObject({match:'inferred',matchBasis:'no-corresponding-step'});
});
it('uniqueness is required independently on each side and scoped to the turn',()=>{
 const a=step(),duplicate={...a,ordinal:1};
 for(const [left,right] of [[[a,duplicate],[a]],[[a],[a,duplicate]]])expect(alignSteps(left,right).find(r=>r.goodOrdinal!==undefined && r.badOrdinal!==undefined)).toMatchObject({match:'inferred',matchBasis:'repeated-fingerprint-order-tie-break'});
 expect(alignSteps([a,{...duplicate,turnOrdinal:2}],[a,{...duplicate,turnOrdinal:2}]).every(r=>r.match==='exact')).toBe(true);
});
for(const side of ['good','bad'])for(const source of ['structural','legacy-unknown'] as const)it(`${side} ${source} identity prevents exact correspondence`,()=>{
 const a=step(),weak=step({identitySource:source});
 expect(alignSteps(side==='good'?[weak]:[a],side==='bad'?[weak]:[a])[0]).toMatchObject({match:'inferred',classification:'changed'});
});
it('identical user and answer nodes without operation identity are inferred differences',()=>{
 const events=trace([]);events.splice(1,0,{type:'node.started',id:'answer',kind:'answer',title:'Answer',ts:2},{type:'node.completed',id:'answer',outputPreview:'same answer',ts:3});
 expect(compareRuns('bad','good',events,events).rows.map(r=>[r.match,r.matchBasis,r.classification])).toEqual(Array(2).fill(['inferred','structural-identity-only','changed']));
});
for(const identitySource of ['captured','structural','legacy-unknown'] as const)for(const running of [false,true])it(`reordered evidence is conservative for ${identitySource}, running=${running}`,()=>{
 // Swap two unique sibling operations; the second step on the good side is moved.
 const a=step({operation:{name:'a'},fingerprint:'a'}),b=step({ordinal:1,operation:{name:'b'},fingerprint:'b',status:running?'running':'completed'});
 const rows=alignSteps([a,b],[{...b,ordinal:0,identitySource},{...a,ordinal:1}]);
 const moved=rows.find(r=>r.classification==='reordered')!;
 expect(moved).toBeDefined();
 expect(moved.match).toBe(identitySource==='captured'&&!running?'exact':'inferred');
 expect(moved.matchBasis).toBe(running?'step-still-running':identitySource==='captured'?'exact-fingerprint':identitySource==='structural'?'structural-identity-only':'legacy-identity-unavailable');
 if(moved.match==='inferred')expect(moved.confidence).not.toBe('high');
});
it('warning counts only paired rows and first divergence is the first non-match',()=>{
 for(const [good,bad,count] of [[trace([{name:'read'}]),trace([{name:'read'},{name:'bash'}]),'1 of 2'],[trace([{name:'read'},{name:'bash'}]),trace([{name:'read'}]),'1 of 2'],[[],[],'0 of 0']] as const){
  const result=compareRuns('bad','good',bad,good);
  expect(result.warnings).toContain(`${count} aligned step pairs are inferred.`);
  expect(result.warnings.join(' ')).toContain('investigative lead, not proof');
  const first=result.rows.findIndex(r=>r.classification!=='matched');expect(result.firstDivergence).toBe(first<0?undefined:first);
 }
 const events=trace([{name:'read'}]).slice(1);const result=compareRuns('bad','good',events,events);
 expect(result.warnings).toContain('0 of 1 aligned step pairs are inferred.');expect(result.firstDivergence).toBeUndefined();
});
it('inferred warning includes repeated and reordered paired rows',()=>{
 for(const specs of [[{name:'read'},{name:'read'}],[{name:'read'},{name:'bash'}]]){
  const good=trace(specs),bad=trace([...specs].reverse());
  const result=compareRuns('bad','good',bad,good);
  expect(result.warnings).toContain(`${specs[0].name===specs[1].name?3:1} of 3 aligned step pairs are inferred.`);
 }
});
