import {it,expect,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {studioHistoryPage} from './studio-history.js';
const run=(runId:string,outcome:string|null=null)=>({runId,prompt:runId,provider:'codex',updatedAt:1,status:'completed',outcome});
const step=(ordinal:number,nodeId='tool',turnOrdinal=1)=>({ordinal,nodeId,turnOrdinal,operation:{name:'<img src=x onerror=alert(1)>'},kind:'tool',status:'completed',identitySource:'captured',inputShape:{}});
const diff=(firstDivergence:number|undefined=0)=>({goodRunId:'base',badRunId:'run',firstDivergence,warnings:['Provisional <script>alert(1)</script>'],good:{steps:[step(0),step(1)]},bad:{steps:[step(0),step(1)]},rows:[{goodOrdinal:0,badOrdinal:0,classification:'changed',confidence:'low',match:'inferred',matchBasis:'structural-identity-only',reason:'Investigate <img src=x>'},{goodOrdinal:1,badOrdinal:1,classification:'matched',confidence:'high',match:'exact',matchBasis:'exact-fingerprint',reason:'Same'}]});
async function setup(provider:string,url='?session=run&node=chosen&q=kept',custom?:(path:string,options:any)=>Promise<Response>|undefined,width=1024) {
 const fetcher=vi.fn(async(path:string,options?:any)=> custom?.(path,options) ?? Response.json(path==='/api/diffs'?diff():path.includes('/events')?{items:[]}:path.startsWith('/api/runs?')?{items:[run('run'),run('base','worked'),run('other','failed')]}:run(path.split('/').at(-1)!)));
 const dom=new JSDOM(studioHistoryPage(provider),{url:'http://localhost/'+url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){Object.defineProperty(w,"innerWidth",{value:width});w.fetch=fetcher as any;w.confirm=vi.fn(()=>true);}});
 const doc=dom.window.document;
 await vi.waitFor(()=>expect(doc.querySelectorAll('.session-row')).toHaveLength(3));
 const click=(selector:string)=> (doc.querySelector(selector) as HTMLElement).click();
 const button=(text:string)=>[...doc.querySelectorAll('button')].find(el=>el.textContent===text)!;
 const open=async()=>{click('#compare-selected');await vi.waitFor(()=>expect(doc.querySelector('#baseline-choices button')).not.toBeNull());};
 const compare=async()=>{await open();(doc.querySelector('#baseline-choices button') as HTMLElement).click();await vi.waitFor(()=>expect(doc.querySelectorAll('.diff-pane')).toHaveLength(2));};
 return {dom,doc,fetcher,click,button,open,compare};
}
for(const provider of ['Claude','Codex']) {
 it(provider+' offers on-demand picker, default Worked filter, pagination, confirmation and modal cleanup',async()=>{
  const s=await setup(provider,undefined,(path)=>path.includes('outcome=worked')?Promise.resolve(Response.json({items:[run('run'),run('base','worked')],nextCursor:'page2'})):undefined);
  try {
   expect(s.doc.querySelector('.actions')!.textContent).not.toMatch(/baseline|Compare/);
   (s.doc.querySelector('#compare-selected') as HTMLElement).focus();await s.open();
   expect(s.fetcher.mock.calls.some(([p])=>p.includes('outcome=worked'))).toBe(true);
   expect(s.doc.querySelectorAll('#baseline-choices button')).toHaveLength(1);
   expect((s.doc.querySelector('.workspace') as HTMLElement).inert).toBe(true);
   s.click('#picker-next');await vi.waitFor(()=>expect(s.fetcher.mock.calls.some(([p])=>p.includes('cursor=page2'))).toBe(true));
   s.click('#picker-other');await vi.waitFor(()=>expect(s.doc.querySelectorAll('#baseline-choices button')).toHaveLength(2));
   (s.dom.window.confirm as any).mockReturnValue(false);(s.doc.querySelectorAll('#baseline-choices button')[1] as HTMLElement).click();expect(s.dom.window.confirm).toHaveBeenCalled();expect(s.doc.querySelector('#baseline-picker')!.hasAttribute('hidden')).toBe(false);
   (s.doc.querySelector('#picker-close') as HTMLElement).focus();s.doc.querySelector('#baseline-picker')!.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));expect(s.doc.activeElement?.id).toBe('picker-query');
   s.doc.querySelector('#baseline-picker')!.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(s.doc.activeElement?.id).toBe('compare-selected');expect((s.doc.querySelector('.workspace') as HTMLElement).inert).toBe(false);
  } finally{s.dom.window.close();}
 });
 it(provider+' links all rows, evidence styles, warnings, actual outcomes and restores trace state without history fetch',async()=>{
  const s=await setup(provider);try {
   const scroll=s.doc.querySelector('.history-scroll')!;scroll.scrollTop=77;await s.compare();
   expect(s.doc.querySelectorAll('.change-rail button')).toHaveLength(2);expect(s.doc.querySelectorAll('.diff-inferred')).toHaveLength(3);expect(s.doc.querySelectorAll('.diff-exact')).toHaveLength(3);
   expect(s.doc.querySelector('[data-side=good] h3')!.textContent).toContain('Worked');expect(s.doc.querySelector('[data-side=bad] h3')!.textContent).toContain('Unreviewed');
   expect(s.doc.querySelector('#comparison')!.textContent).toContain('Provisional <script>');expect(s.doc.querySelector('#comparison img, #comparison script')).toBeNull();
   s.button('First detected difference').click();expect(s.doc.querySelectorAll('.diff-selected')).toHaveLength(3);expect(s.doc.querySelector('.diff-toolbar [role=status]')!.textContent).toContain('Inferred evidence');
   expect(s.doc.querySelector('#map')!.getAttribute('selected-node')).toBe('chosen');s.click('[data-view=overview]');s.click('[data-view=compare]');expect(s.doc.querySelector('#comparison')!.hasAttribute('hidden')).toBe(false);
   const calls=s.fetcher.mock.calls.length;s.button('Back to trace').click();expect(s.fetcher.mock.calls.length).toBe(calls);expect(s.dom.window.location.search).not.toContain('baseline');expect(s.dom.window.location.search).toContain('q=kept');expect(scroll.scrollTop).toBe(77);expect(s.doc.querySelector('#map')!.getAttribute('selected-node')).toBe('chosen');
  }finally{s.dom.window.close();}
 });
 it(provider+' restores direct links once, disables first difference only if absent, and always reopens picker from header',async()=>{
  const s=await setup(provider,'?session=run&baseline=base',(p)=>p==='/api/diffs'?Promise.resolve(Response.json({...diff(),firstDivergence:undefined})):undefined,390);
  try {await vi.waitFor(()=>expect(s.doc.querySelectorAll('.diff-pane')).toHaveLength(2));expect(s.fetcher.mock.calls.filter(([p])=>p.startsWith('/api/runs?'))).toHaveLength(1);
   expect(s.button('First detected difference').disabled).toBe(true);expect(s.doc.querySelector('.studio')!.hasAttribute('data-sidebar-collapsed')).toBe(true);await s.open();expect(s.doc.querySelector('#baseline-picker')!.hasAttribute('hidden')).toBe(false);
  }finally{s.dom.window.close();}
 });
 it(provider+' falls back from invalid baseline and cleans up picker request errors',async()=>{
  const s=await setup(provider,'?session=run&baseline=missing',(p)=>p==='/api/runs/missing'?Promise.resolve(Response.json({error:{message:'Missing'}},{status:404})):p.includes('outcome=worked')?Promise.reject(new Error('Offline')):undefined);
  try{await vi.waitFor(()=>expect(s.doc.querySelector('#notice')!.textContent).toContain('Baseline unavailable'));expect(s.dom.window.location.search).not.toContain('baseline');s.click('#compare-selected');await vi.waitFor(()=>expect(s.doc.querySelector('#notice')!.textContent).toContain('Offline'));expect((s.doc.querySelector('.rail') as HTMLElement).inert).toBe(false);expect((s.doc.querySelector('.workspace') as HTMLElement).inert).toBe(false);}finally{s.dom.window.close();}
 });
 it(provider+' invalidates pending comparison on run changes, Problems and browser Back',async()=>{
  for(const navigation of ['run','problems','back']) {
   let resolve!:(r:Response)=>void;const pending=new Promise<Response>(r=>resolve=r);
   const s=await setup(provider,undefined,p=>p==='/api/diffs'?pending:undefined);
   try{await s.open();(s.doc.querySelector('#baseline-choices button') as HTMLElement).click();await vi.waitFor(()=>expect(s.fetcher.mock.calls.some(([p])=>p==='/api/diffs')).toBe(true));
    if(navigation==='run')(s.doc.querySelectorAll('.session')[1] as HTMLElement).click();else if(navigation==='problems')s.click('#nav-problems');else {s.dom.window.history.replaceState(null,'','?session=run');s.dom.window.dispatchEvent(new s.dom.window.PopStateEvent('popstate'));}
    resolve(Response.json(diff()));await new Promise(r=>setTimeout(r,20));expect(s.doc.querySelectorAll('.diff-pane')).toHaveLength(0);expect(s.doc.querySelector('#comparison')!.hasAttribute('hidden')).toBe(true);expect((s.doc.querySelector('.workspace') as HTMLElement).inert).toBe(false);
   }finally{s.dom.window.close();}
  }
 });
 it(provider+' scopes repeated original node IDs and synthetic users to analyzer step and turn',async()=>{
  const events=[{type:'run.started',runId:'base',prompt:'first'},{type:'node.started',id:'tool',kind:'tool'},{type:'node.completed',id:'tool',outputPreview:'FIRST ONLY'},{type:'run.started',runId:'base',prompt:'second'},{type:'node.started',id:'tool',kind:'tool'},{type:'node.completed',id:'tool',outputPreview:'SECOND ONLY'}].map((payload,sequence)=>({sequence,payload}));
  const d=diff();d.good.steps=[step(0,'user-base',1),step(3,'tool',2)];d.rows[1].goodOrdinal=3;
  const s=await setup(provider,undefined,p=>p==='/api/diffs'?Promise.resolve(Response.json(d)):p.includes('/events')?Promise.resolve(Response.json({items:events})):undefined);
  try{await s.compare();const cards=s.doc.querySelectorAll('[data-side=good] article');(cards[1].querySelectorAll('button')[1] as HTMLElement).click();await vi.waitFor(()=>expect(cards[1].textContent).toContain('SECOND ONLY'));expect(cards[1].textContent).not.toContain('FIRST ONLY');(cards[0].querySelectorAll('button')[1] as HTMLElement).click();await vi.waitFor(()=>expect(cards[0].textContent).toContain('run.started'));expect(cards[0].textContent).not.toContain('second');}finally{s.dom.window.close();}
 });
}
for (const provider of ['Claude','Codex']) {
 it(provider+' restores comparison through real browser-history traversal after selecting another run',async()=>{
  const s=await setup(provider);try{await s.compare();(s.doc.querySelectorAll('.session')[2] as HTMLElement).click();expect(s.dom.window.location.search).toContain('session=other');expect(s.dom.window.location.search).not.toContain('baseline');s.dom.window.history.back();await vi.waitFor(()=>expect(s.doc.querySelectorAll('.diff-pane')).toHaveLength(2));expect(s.dom.window.location.search).toContain('session=run');expect(s.dom.window.location.search).toContain('baseline=base');}finally{s.dom.window.close();}
 });
 it(provider+' refreshes comparison outcome and label after candidate or baseline PATCH',async()=>{
  const s=await setup(provider,undefined,(p,o)=>o?.method==='PATCH'?Promise.resolve(Response.json({...run(p.split('/').at(-1)!),...JSON.parse(o.body)})):undefined);
  try{await s.compare();for(const [id,side] of [['run','bad'],['base','good']]) {
   const menu=s.doc.querySelector('.row-menu[data-run="'+id+'"]')!;
   ([...menu.querySelectorAll('button')].find(b=>b.textContent==='Needs work')!).click();await vi.waitFor(()=>expect(s.doc.querySelector('[data-side='+side+'] h3')!.textContent).toContain('Needs work'));
   await vi.waitFor(()=>expect((s.doc.querySelector('.row-menu[data-run="'+id+'"] input') as HTMLInputElement).disabled).toBe(false));
   (s.doc.querySelector('.row-menu[data-run="'+id+'"] input') as HTMLInputElement).value='Updated '+id;
   ([...s.doc.querySelectorAll('.row-menu[data-run="'+id+'"] button')].find(b=>b.textContent==='Save label') as HTMLElement).click();await vi.waitFor(()=>expect(s.doc.querySelector('[data-side='+side+'] h3')!.textContent).toContain('Updated '+id));
  }}finally{s.dom.window.close();}
 });
 it(provider+' labels missing counterparts as inferred and covers every evidence basis',async()=>{
  const bases=['no-corresponding-step','step-still-running','legacy-identity-unavailable','structural-identity-only','same-operation-input-shape-differs','repeated-fingerprint-order-tie-break','exact-fingerprint-status-differs','exact-fingerprint'];
  const d=diff();d.rows=bases.map((matchBasis,i)=>({...d.rows[0],matchBasis,goodOrdinal:i===0?undefined:0,badOrdinal:0})) as any;
  const s=await setup(provider,undefined,p=>p==='/api/diffs'?Promise.resolve(Response.json(d)):undefined);
  try{await s.compare();expect(s.doc.querySelectorAll('.change-rail button')).toHaveLength(8);const missing=s.doc.querySelector('[data-side=good] article')!;expect(missing.classList.contains('diff-inferred')).toBe(true);expect(missing.textContent).toContain('No corresponding step');expect(missing.textContent).toContain('Inferred evidence');expect(s.doc.querySelector('#comparison')!.textContent).not.toContain('Evidence unavailable');}finally{s.dom.window.close();}
 });
}

for (const provider of ['Claude','Codex']) {
 it(provider+' disables comparison without a selected run',async()=>{
  const dom=new JSDOM(studioHistoryPage(provider),{url:'http://localhost/',runScripts:'dangerously',beforeParse(w){w.fetch=async()=>Response.json({items:[]});}});
  try{await vi.waitFor(()=>expect(dom.window.document.querySelector('#notice')!.textContent).toBe('0 runs loaded'));expect((dom.window.document.querySelector('#compare-selected') as HTMLButtonElement).disabled).toBe(true);expect((dom.window.document.querySelector('[data-view=compare]') as HTMLButtonElement).disabled).toBe(true);}finally{dom.window.close();}
 });
 it(provider+' invalidates comparison when its baseline is deleted',async()=>{
  const s=await setup(provider,undefined,(_p,o)=>o?.method==='DELETE'?Promise.resolve(new Response(null,{status:204})):undefined);
  try{await s.compare();([...s.doc.querySelectorAll('.row-menu[data-run=base] button')].find(b=>b.textContent==='Delete run') as HTMLElement).click();await vi.waitFor(()=>expect(s.doc.querySelectorAll('.diff-pane')).toHaveLength(0));expect(s.dom.window.location.search).not.toContain('baseline');expect(s.doc.querySelector('#map')!.hasAttribute('hidden')).toBe(false);}finally{s.dom.window.close();}
 });
}
