import {it,expect,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {studioHistoryPage} from './studio-history.js';
import {compareRuns} from '../../core/src/diff.js';
import {trace} from '../../core/test/comparison-fixture.js';
for(const provider of ['Claude','Codex'])it(provider+' baseline search, split routes, linked selection, first jump and inspect original',async()=>{
 const diff=compareRuns('bad','good',trace([{name:'read',input:{path:'a.py'}}],'bad'),trace([{name:'read',input:{path:'a.ts'}}],'good'));
 const rows=['bad','good'].map(runId=>({runId,label:runId,provider:'codex',model:'model-test',outcome:runId==='bad'?'failed':'worked',updatedAt:1,eventCount:5}));
 const fetcher=vi.fn(async(path:string,options?:RequestInit)=>{
  if(path==='/api/diffs'){expect(JSON.parse(String(options?.body))).toEqual({badRunId:'bad',goodRunId:'good'});return Response.json(diff);}
  if(path.endsWith('/events'))return Response.json({items:trace([{name:'read',failed:true}],'bad').map(payload=>({payload}))});
  return Response.json({items:path.includes('outcome=worked')?[rows[1]]:rows});
 });
 const scroll=vi.fn();const dom=new JSDOM(studioHistoryPage(provider),{url:'http://localhost',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.fetch=fetcher as any;w.HTMLElement.prototype.scrollIntoView=scroll;}});
 try {
  const doc=dom.window.document;const click=(label:string)=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===label);expect(b).toBeTruthy();(b as HTMLButtonElement).click();};
  await vi.waitFor(()=>expect(doc.querySelectorAll('.session-row')).toHaveLength(2));click('Compare with Worked');
  await vi.waitFor(()=>expect(doc.querySelectorAll('#baseline-choices button')).toHaveLength(1));
  expect(fetcher.mock.calls.some(([path])=>path.includes('outcome=worked'))).toBe(true);
  expect(doc.querySelector('#baseline-choices')!.textContent).toContain('model-test');
  (doc.querySelector('#baseline-choices button') as HTMLButtonElement).click();
  await vi.waitFor(()=>expect(doc.querySelectorAll('.diff-pane')).toHaveLength(2));click('First divergence');
  expect(doc.querySelectorAll('.diff-pane .diff-selected')).toHaveLength(2);expect(scroll).toHaveBeenCalledTimes(2);
  expect(doc.querySelector('.diff-toolbar [role=status]')!.textContent).toContain('normalized input structure differs');
  (doc.querySelector('.diff-pane[data-side=bad] .diff-step:nth-of-type(2) button:last-child') as HTMLButtonElement).click();
  await vi.waitFor(()=>expect(doc.querySelector('.diff-pane[data-side=bad]')!.textContent).toContain('Synthetic failure'));
  click('Back to trace');expect((doc.querySelector('#comparison') as HTMLElement).hidden).toBe(true);
 } finally {dom.window.close();}
});
it('shows comparison errors and ignores late results after closing',async()=>{
 let resolve:(v:Response)=>void=()=>{};const deferred=new Promise<Response>(r=>resolve=r);
 const dom=new JSDOM(studioHistoryPage('test'),{url:'http://localhost?session=bad&baseline=good',runScripts:'dangerously',beforeParse(w){w.fetch=vi.fn((path:string)=>path==='/api/diffs'?deferred:Promise.resolve(Response.json({items:[]}))) as any;}});
 try{const doc=dom.window.document;(doc.querySelector('#compare-selected') as HTMLButtonElement).click();const back=[...doc.querySelectorAll('button')].find(b=>b.textContent==='Back to trace')!;back.click();resolve(Response.json({error:{message:'Synthetic unavailable'}},{status:500}));await new Promise(r=>setTimeout(r,10));expect((doc.querySelector('#comparison') as HTMLElement).hidden).toBe(true);}finally{dom.window.close();}
});
