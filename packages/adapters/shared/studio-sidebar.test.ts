import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { studioHistoryPage } from './studio-history.js';
const windows:JSDOM[]=[];
afterEach(()=>{for(const dom of windows.splice(0))dom.window.close();});
function setup(saved?:string) {
  const dom=new JSDOM(studioHistoryPage('Codex'),{url:'http://localhost',runScripts:'dangerously',beforeParse(w){w.fetch=vi.fn(async()=>Response.json({items:[]})) as any;if(saved)w.localStorage.setItem('agent-think-map.sidebar.v1',saved);}});
  windows.push(dom); const doc=dom.window.document;
  const handle=doc.getElementById('sidebar-resizer')!;
  return {dom,doc,handle,width:()=>Number(handle.getAttribute('aria-valuenow')),key:(key:string)=>handle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true}))};
}
it('drags within bounds and cancels an interrupted resize',()=>{
  const ui=setup();
  const pointer=(target:EventTarget,type:string,x:number)=>target.dispatchEvent(new ui.dom.window.MouseEvent(type,{clientX:x,button:0,bubbles:true}));
  pointer(ui.handle,'pointerdown',320);pointer(ui.dom.window,'pointermove',450);expect(ui.width()).toBe(450);
  pointer(ui.dom.window,'pointerup',450);
  pointer(ui.handle,'pointerdown',450);pointer(ui.dom.window,'pointermove',1000);expect(ui.width()).toBe(640);
  ui.key('Escape');expect(ui.width()).toBe(450);
  expect(ui.doc.querySelector('.studio')!.hasAttribute('data-sidebar-dragging')).toBe(false);
  ui.key('Home');expect(ui.width()).toBe(240);ui.key('ArrowRight');expect(ui.width()).toBe(256);
});
it('collapses, restores focus and width, and persists across reloads',()=>{
  const ui=setup();ui.key('End');
  (ui.doc.getElementById('collapse-sidebar') as HTMLButtonElement).click();
  expect(ui.doc.getElementById('history-sidebar')!.hidden).toBe(true);
  expect(ui.doc.activeElement?.id).toBe('expand-sidebar');
  const saved=ui.dom.window.localStorage.getItem('agent-think-map.sidebar.v1')!;
  const reopened=setup(saved);expect(reopened.doc.getElementById('history-sidebar')!.hidden).toBe(true);
  (reopened.doc.getElementById('expand-sidebar') as HTMLButtonElement).click();
  expect(reopened.width()).toBe(640);expect(reopened.doc.getElementById('history-sidebar')!.hidden).toBe(false);
  expect(reopened.doc.activeElement?.id).toBe('collapse-sidebar');
});
it('ignores malformed preferences and clamps the pane to the available viewport',()=>{
  const ui=setup('{invalid');expect(ui.width()).toBe(320);
  ui.key('End');Object.defineProperty(ui.dom.window,'innerWidth',{value:800,configurable:true});
  ui.dom.window.dispatchEvent(new ui.dom.window.Event('resize'));expect(ui.width()).toBe(432);
});
it('keeps a single pagination action inside history and removes the overlapping back control',()=>{
  const ui=setup();
  expect(ui.doc.querySelector('#previous')).toBeNull();
  expect(ui.doc.querySelector('.rail-footer')!.textContent).not.toContain('Back to recent');
  expect(ui.doc.querySelectorAll('.rail-footer button')).toHaveLength(1);
  expect(ui.doc.querySelector('#next')!.closest('#history-sidebar')).toBeTruthy();
});
it('keeps the trace accessible with the narrow drawer open and closes it with Escape',()=>{
  const ui=setup();
  Object.defineProperty(ui.dom.window,'innerWidth',{value:576,configurable:true});
  ui.dom.window.dispatchEvent(new ui.dom.window.Event('resize'));
  const workspace=ui.doc.querySelector<HTMLElement>('.workspace')!;
  expect(workspace.hasAttribute('aria-hidden')).toBe(false);
  expect(workspace.hasAttribute('inert')).toBe(false);
  expect(ui.doc.getElementById('history-sidebar')!.hidden).toBe(false);
  ui.dom.window.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Escape'}));
  expect(ui.doc.getElementById('history-sidebar')!.hidden).toBe(true);
  expect(ui.doc.activeElement?.id).toBe('expand-sidebar');
});
