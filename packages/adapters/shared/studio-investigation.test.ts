import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { studioHistoryPage } from './studio-history.js';
const windows: JSDOM[] = [];
afterEach(() => { for (const dom of windows.splice(0)) dom.window.close(); });
function setup(width = 1024) {
  const events = [
    {type:'run.started',runId:'one',prompt:'Fix checkout',ts:1},
    {type:'node.started',id:'agent',kind:'subagent',title:'Implementer',reason:'Fix redirect',ts:2},
    {type:'node.started',id:'tool',parentId:'agent',kind:'tool',title:'Read checkout',ts:3},
    {type:'node.failed',id:'tool',error:'Permission denied <img src=x>',ts:4},
  ].map((payload,i) => ({payload,sequence:i+1}));
  const fetcher = vi.fn(async(path:string) => Response.json(path === '/api/problems' ? {partial:false,items:[{id:'problem',operation:'read',message:'Permission denied',runCount:24,count:26,lastSeen:1,occurrences:[{runId:'one',title:'Fix checkout',provider:'codex',timestamp:1,sequence:4}]}]} : path.endsWith('/events') ? {items:events} : {items:[{runId:'one',prompt:'Fix checkout',provider:'codex',updatedAt:1,status:'running',outcome:null}]}));
  const dom = new JSDOM(studioHistoryPage('Codex'),{url:'http://localhost',runScripts:'dangerously',beforeParse(w) { w.fetch = fetcher as any; Object.defineProperty(w,'innerWidth',{value:width}); }}); windows.push(dom);
  const doc = dom.window.document;
  const click = (text:string) => { const button = [...doc.querySelectorAll('button')].find(el => el.textContent === text)!; expect(button,text).toBeTruthy(); button.click(); };
  return {doc,dom,click,fetcher};
}
it('follows a captured agent to evidence, preserves text safety, and locates the step in the trace',async() => {
  const ui = setup(); await vi.waitFor(() => expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(1));
  ui.click('Agents'); await vi.waitFor(() => expect(ui.doc.querySelector('.agent-row')?.textContent).toContain('Implementer → Read checkout'));
  expect(ui.doc.querySelector('img')).toBeNull(); expect(ui.doc.querySelector('.agent-row')?.textContent).toContain('1 recorded steps · 1 errors');
  ui.click('Locate in trace'); expect(ui.doc.getElementById('map')!.getAttribute('selected-node')).toBe('tool');
  expect(ui.dom.window.location.search).toContain('node=tool'); expect(ui.doc.getElementById('investigation')!.hidden).toBe(true);
});
it('uses server problem counts and opens a run from an occurrence',async() => {
  const ui = setup(); await vi.waitFor(() => expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(1));
  ui.click('Problems'); await vi.waitFor(() => expect(ui.doc.querySelector('.problem-row')?.textContent).toContain('24 runs · 26 occurrences'));
  expect(ui.doc.getElementById('run-title')!.textContent).toBe('Recurring problems');
  expect((ui.doc.querySelector('.workspace-tabs') as HTMLElement).hidden).toBe(true);
  (ui.doc.querySelector('.problem-row') as HTMLButtonElement).click();
  expect(ui.doc.getElementById('investigation')!.textContent).toContain('Next check');
  ui.click('Open run evidence'); await vi.waitFor(() => expect(ui.doc.getElementById('investigation')!.textContent).toContain('Run overview'));
  expect(ui.doc.getElementById('sessions')!.hidden).toBe(false);
  expect((ui.doc.querySelector('.workspace-tabs') as HTMLElement).hidden).toBe(false);
});
it('ignores a late evidence response after returning to the trace',async() => {
  const ui = setup(); await vi.waitFor(() => expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(1));
  let resolve!: (value:Response) => void;
  ui.fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  ui.click('Overview'); ui.click('Trace'); resolve(Response.json({items:[]}));
  await new Promise(done => setTimeout(done,0)); expect(ui.doc.getElementById('investigation')!.hidden).toBe(true);
  expect(ui.doc.getElementById('map')!.hidden).toBe(false);
});
it('opens a run or problem as a separate detail view on narrow screens',async() => {
  const ui=setup(576);await vi.waitFor(()=>expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(1));
  (ui.doc.querySelector('.session') as HTMLButtonElement).click();
  expect(ui.doc.getElementById('history-sidebar')!.hidden).toBe(true);
  (ui.doc.getElementById('expand-sidebar') as HTMLButtonElement).click();
  expect(ui.doc.getElementById('history-sidebar')!.hidden).toBe(false);
  ui.click('Problems');await vi.waitFor(()=>expect(ui.doc.querySelector('.problem-row')).toBeTruthy());
  (ui.doc.querySelector('.problem-row') as HTMLButtonElement).click();
  expect(ui.doc.getElementById('history-sidebar')!.hidden).toBe(true);
  expect(ui.doc.getElementById('investigation')!.textContent).toContain('Next check');
});
