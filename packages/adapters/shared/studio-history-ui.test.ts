import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { studioPage as claudePage } from "../claude-code/src/studio.js";
import { studioPage as codexPage } from "../codex/src/studio.js";
const windows:JSDOM[]=[];
afterEach(()=>{for(const dom of windows.splice(0))dom.window.close();});
const run=(id:string)=>({runId:id,provider:"codex",prompt:"Task "+id,model:"model-x",status:"completed",updatedAt:1000,eventCount:3,outcome:null,bookmarked:false});
function setup(page:()=>string, initial=Array.from({length:21},(_,i)=>run(String(i)))) {
  let rows:any[]=initial;let fail=false;
  const fetcher=vi.fn(async(path:string,options?:RequestInit)=>{
    if(fail) return new Response(JSON.stringify({error:{message:"Save unavailable"}}),{status:500});
    const url=new URL(path,"http://localhost");
    if(options?.method) {
      const id=url.pathname.split('/').at(-1);const item=rows.find(row=>row.runId===id);
      if(options.method==='DELETE') {rows=rows.filter(row=>row!==item);return new Response(null,{status:204});}
      Object.assign(item,JSON.parse(String(options.body)));return Response.json(item);
    }
    const start=url.searchParams.has('cursor')?20:0;
    return Response.json({items:rows.slice(start,start+20),nextCursor:rows.length>start+20?'cursor-20':undefined});
  });
  const dom=new JSDOM(page(),{url:"http://localhost",runScripts:"dangerously",beforeParse(window){window.fetch=fetcher as any;window.confirm=()=>true;}});windows.push(dom);
  const doc=dom.window.document;
  const buttons=(text:string)=>Array.from(doc.querySelectorAll('button')).filter(b=>b.textContent===text) as HTMLButtonElement[];
  const click=(text:string)=>buttons(text)[0].click();
  return {dom,doc,fetcher,buttons,click,setFail:(value:boolean)=>fail=value,rows:()=>rows};
}
for(const [provider,page] of [["Claude",claudePage],["Codex",codexPage]] as const) describe(`${provider} shared history client`,()=>{
  it("shows imported provenance and submits the Origin filter",async()=>{
    const ui=setup(page,[{...run('imported'),origin:'imported'} as any,run('live')]);
    await vi.waitFor(()=>expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(2));
    expect(ui.doc.querySelectorAll('.session-meta')[0].textContent).toContain('Imported');
    expect(ui.doc.querySelectorAll('.session-meta')[1].textContent).not.toContain('Imported');
    const select=ui.doc.querySelector('select[name="origin"]') as HTMLSelectElement;
    expect([...select.options].map(option=>option.textContent)).toEqual(['All','Live','Imported']);
    select.value='imported'; ui.click('↻');
    await vi.waitFor(()=>expect(ui.fetcher.mock.calls.at(-1)![0]).toContain('origin=imported'));
    expect(ui.dom.window.location.search).toContain('origin=imported');
  });
  it("loads one page, pages forward/back, and sends search and every filter to the API",async()=>{
    const ui=setup(page);expect(ui.doc.getElementById('notice')!.textContent).toContain('Loading');
    await vi.waitFor(()=>expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(20));
    expect(ui.fetcher.mock.calls[0][0]).toBe('/api/runs?limit=20');ui.click('Load more');
    await vi.waitFor(()=>expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(21));
    expect(ui.fetcher.mock.calls.at(-1)![0]).toContain('cursor=cursor-20');ui.click('↻');
    await vi.waitFor(()=>expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(20));
    for(const [name,value] of Object.entries({q:'read file',provider:'codex',model:'model-x',status:'completed',outcome:'worked',bookmarked:'true',from:'2026-01-01',to:'2026-01-02'})) (ui.doc.querySelector(`[name="${name}"]`) as HTMLInputElement).value=value;
    ui.click('↻');await vi.waitFor(()=>expect(ui.fetcher.mock.calls.at(-1)![0]).toContain('q=read+file'));
    const params=new URL(ui.fetcher.mock.calls.at(-1)![0],'http://localhost').searchParams;
    for(const key of ['provider','model','status','outcome','bookmarked','from','to'])expect(params.has(key)).toBe(true);
    expect(params.has('cursor')).toBe(false);expect(ui.fetcher.mock.calls.every(([path])=>path.startsWith('/api/runs?'))).toBe(true);
  });
  it("marks outcomes, bookmarks, edits and clears labels, and deletes",async()=>{
    const ui=setup(page,[run('one')]);await vi.waitFor(()=>expect(ui.buttons('Worked')).toHaveLength(1));
    ui.click('Worked');await vi.waitFor(()=>expect(ui.buttons('Worked')[0].getAttribute('aria-pressed')).toBe('true'));
    ui.click('Bookmark');await vi.waitFor(()=>expect(ui.buttons('Unbookmark')).toHaveLength(1));
    const label=ui.doc.querySelector('.actions input') as HTMLInputElement;label.value='Good baseline';ui.click('Save label');
    await vi.waitFor(()=>expect(ui.doc.querySelector('.session-title')!.textContent).toBe('Good baseline'));
    ui.click('Needs work');await vi.waitFor(()=>expect(ui.buttons('Needs work')[0].getAttribute('aria-pressed')).toBe('true'));
    expect(ui.dom.window.location.search).not.toContain('baseline=');
    ui.click('Clear outcome');await vi.waitFor(()=>expect(ui.buttons('Needs work')[0].getAttribute('aria-pressed')).toBe('false'));
    (ui.doc.querySelector('.actions input') as HTMLInputElement).value='';ui.click('Save label');
    await vi.waitFor(()=>expect(ui.doc.querySelector('.session-title')!.textContent).toBe('Task one'));
    ui.click('Unbookmark');await vi.waitFor(()=>expect(ui.buttons('Bookmark')).toHaveLength(1));
    ui.click('Delete run');await vi.waitFor(()=>expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(0));
    expect(ui.doc.getElementById('map')!.hasAttribute('events-url')).toBe(false);
  });
  it("preserves confirmed outcomes, bookmarks, label drafts and focus on failed writes",async()=>{
    const ui=setup(page,[run('one')]);await vi.waitFor(()=>expect(ui.buttons('Worked')).toHaveLength(1));ui.setFail(true);
    const label=ui.doc.querySelector('.actions input') as HTMLInputElement;label.value='Unsaved draft';label.focus();
    for(const text of ['Worked','Needs work','Bookmark','Save label','Delete run']) {
      ui.click(text);await vi.waitFor(()=>expect(ui.doc.getElementById('notice')!.textContent).toContain('Save unavailable'));
      expect(ui.doc.querySelectorAll('.session-row')).toHaveLength(1);expect(ui.buttons('Worked')[0].getAttribute('aria-pressed')).toBe('false');expect(ui.buttons('Bookmark')).toHaveLength(1);expect(label.value).toBe('Unsaved draft');
    }
    expect(ui.doc.activeElement).toBe(label);ui.setFail(false);ui.click('Save label');await vi.waitFor(()=>expect(ui.doc.querySelector('.session-title')!.textContent).toBe('Unsaved draft'));
  });
  it("shows loading errors and retries while safely rendering untrusted text",async()=>{
    const ui=setup(page,[{...run('one'),prompt:'<img src=x onerror=alert(1)>'}]);await vi.waitFor(()=>expect(ui.buttons('Worked')).toHaveLength(1));
    expect(ui.doc.querySelector('img')).toBeNull();ui.setFail(true);ui.click('↻');
    await vi.waitFor(()=>expect(ui.doc.getElementById('notice')!.textContent).toContain('retry'));
    expect(ui.doc.getElementById('sessions')!.getAttribute('aria-busy')).toBe('false');
    ui.setFail(false);ui.click('↻');await vi.waitFor(()=>expect(ui.doc.getElementById('notice')!.textContent).toContain('1 runs loaded'));
  });
  it("ignores late search responses and keeps keyboard focus after a saved outcome",async()=>{
    const ui=setup(page,[run('one')]);await vi.waitFor(()=>expect(ui.buttons('Worked')).toHaveLength(1));
    let resolveOld!:(value:Response)=>void;
    ui.fetcher.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
    ui.click('↻');
    ui.fetcher.mockResolvedValueOnce(Response.json({items:[run('new')]}));ui.click('↻');
    await vi.waitFor(()=>expect(ui.doc.querySelector('.session-title')!.textContent).toBe('Task new'));
    resolveOld(Response.json({items:[run('stale')]}));await new Promise(resolve=>setTimeout(resolve,10));
    expect(ui.doc.querySelector('.session-title')!.textContent).toBe('Task new');
    ui.click('↻');await vi.waitFor(()=>expect(ui.doc.querySelector('.session-title')!.textContent).toBe('Task one'));
    ui.buttons('Worked')[0].focus();ui.click('Worked');
    await vi.waitFor(()=>expect(ui.buttons('Worked')[0].getAttribute('aria-pressed')).toBe('true'));
    expect(ui.doc.activeElement).toBe(ui.buttons('Worked')[0]);
  });
});
