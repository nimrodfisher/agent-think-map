import {it,expect} from 'vitest';
import {analyzeRun} from './analysis.js';
import {trace} from '../test/comparison-fixture.js';
it('analyzes only after complete chunked input and retains operation independent of title',()=>{
 const events=trace([{name:'read',input:{file_path:'a.ts'}}]);const input=events.find(e=>e.type==='tool.input')!;if(input.type!=='tool.input')throw Error();const full=input.partial;input.partial=full.slice(0,7);events.splice(events.indexOf(input)+1,0,{...input,partial:full.slice(7)});
 const a=analyzeRun(events);expect(a.steps[1].inputShape).toEqual({file_path:{fileExtension:'ts'}});expect(a.steps[1].operation.name).toBe('read');
});
it('does not infer old semantic identities from display titles',()=>{const events=trace([{name:'read'}]);for(const e of events)if(e.type==='node.started')delete e.operation;const a=analyzeRun(events);expect(a.steps[1].operation.name).toBe('unknown');expect(a.warnings).toHaveLength(1);});
it('preserves multiple user turns including provider run.started restarts',()=>{const events=[...trace([{name:'read'}]),...trace([{name:'bash'}])];expect(analyzeRun(events).steps.map(s=>s.turnOrdinal)).toEqual([1,1,2,2]);});
