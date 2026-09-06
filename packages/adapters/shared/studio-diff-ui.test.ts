import {it,expect,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {studioHistoryPage} from './studio-history.js';
for (const provider of ['Claude','Codex']) it(provider+' removes comparison UI and safely opens an old baseline URL',async() => {
  const fetcher=vi.fn(async()=>Response.json({items:[{runId:'run',prompt:'Example',provider:'codex',updatedAt:1,status:'completed',outcome:'worked'}]}));
  const dom=new JSDOM(studioHistoryPage(provider),{url:'http://localhost/?session=run&baseline=old',runScripts:'dangerously',beforeParse(w){w.fetch=fetcher as any;}});
  try {
    const doc=dom.window.document;
    await vi.waitFor(()=>expect(doc.querySelectorAll('.session-row')).toHaveLength(1));
    expect(doc.querySelector('#baseline-picker, #comparison, #compare-selected')).toBeNull();
    expect(doc.querySelector('.actions')!.textContent).not.toMatch(/baseline|Compare/);
    expect(dom.window.location.search).toBe('?session=run');
    expect(doc.querySelector('main')!.inert).not.toBe(true);
    expect(fetcher.mock.calls).toHaveLength(1);
  } finally {dom.window.close();}
});
