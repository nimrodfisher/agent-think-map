import { sidebarClient } from "./studio-sidebar.js";
import { studioStyles } from "./studio-shell.js";
import { investigationClient } from "./studio-investigation.js";
/** One client for both providers. Only the current API page is retained in memory. */
export const historyClient = String.raw`
const list = document.getElementById('sessions');
const map = document.getElementById('map');
const form = document.getElementById('history-filters');
const notice = document.getElementById('notice');
const next = document.getElementById('next');
const initialParams = new URLSearchParams(location.search); initialParams.delete('baseline'); history.replaceState(history.state,'','?' + initialParams);
let selected = initialParams.get('session');
let items = [], cursor, nextCursor, stack = [], generation = 0, busy = false, loading = false;
function saveUrl() {
  const params = new URLSearchParams(location.search);
  for (const [key,value] of [['session',selected]]) { if (value) params.set(key,value); else params.delete(key); }
  history.replaceState(null,'','?' + params);
}
function selectRun(id, openOnMobile = false) {
  if (id !== selected) {
    if (selected) { history.replaceState({scroll:document.querySelector('.history-scroll').scrollTop},'',location.href); history.pushState(null,'',location.href); }
    map.removeAttribute('selected-node'); const params = new URLSearchParams(location.search); params.delete('node'); history.replaceState(null,'','?' + params);
  }
  selected = id;
  map.setAttribute('events-url','/sse?session=' + encodeURIComponent(id));
  saveUrl();
  updateRunHeader();
  if (typeof showView === 'function') showView('trace');
  if (openOnMobile && innerWidth <= 640 && !sidebarCollapsed) collapseSidebar.click();
}
async function request(path, options) {
  const response = await fetch(path,options);
  if (!response.ok) {
    let message = 'Request failed (' + response.status + ')';
    try { message = (await response.json()).error.message || message; } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}
function button(text, action) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  el.addEventListener('click',action); return el;
}
function draw() {
  const active = document.activeElement;
  const focusId = active && active.dataset.focus;
  const openMenus = new Set([...list.querySelectorAll('.row-menu[open]')].map(el => el.dataset.run));
  list.replaceChildren();
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No runs match. Clear filters or record a run to get started.'; list.append(empty); }
  let lastDate;
  for (const run of items) {
    const date = new Date(run.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    if (date !== lastDate) { const group = document.createElement('h2'); group.className = 'date-group'; group.textContent = date; list.append(group); lastDate = date; }
    const row = document.createElement('article'); row.className = 'session-row';
    const title = button(run.label || run.prompt || run.runId,() => { selectRun(run.runId,true); draw(); });
    const titleText = document.createElement('span'); titleText.className = 'session-title'; titleText.textContent = title.textContent; title.replaceChildren(titleText);
    title.className = 'session'; title.dataset.focus = run.runId + ':open';
    if (run.runId === selected) title.setAttribute('aria-current','true');
    row.append(title);
    title.title = run.prompt || run.label || run.runId;
    const meta = document.createElement('span'); meta.className = 'session-meta';
    const status = document.createElement('span'); status.className = 'status-dot status-' + run.status; status.textContent = ({running:'●',completed:'✓',failed:'×',interrupted:'◷'})[run.status] || '○'; status.setAttribute('aria-label',run.status || 'Unknown status');
    const stamp = document.createElement('span'); stamp.textContent = [run.provider,run.origin === 'imported' ? 'Imported' : '',relativeTime(run.updatedAt),run.bookmarked ? '★' : ''].filter(Boolean).join(' · ');
    meta.append(status,stamp); title.append(meta);
    const menu = document.createElement('details'); menu.className = 'row-menu';
    menu.dataset.run = run.runId; menu.open = openMenus.has(run.runId);
    const trigger = document.createElement('summary'); trigger.textContent = '⋯'; trigger.setAttribute('aria-label','Actions for ' + (run.label || run.prompt || run.runId)); menu.append(trigger);
    menu.addEventListener('toggle',() => { if (menu.open) { for (const other of list.querySelectorAll('details[open]')) if (other !== menu) other.open = false; const rect = trigger.getBoundingClientRect(); actions.style.position = 'fixed'; actions.style.right = 'auto'; actions.style.left = Math.max(8,Math.min(rect.right-235,innerWidth-243)) + 'px'; actions.style.top = Math.max(8,Math.min(rect.bottom+4,innerHeight-actions.offsetHeight-8)) + 'px'; } });
    menu.addEventListener('keydown',event => { if (event.key === 'Escape') { menu.open = false; trigger.focus(); } });
    const actions = document.createElement('div'); actions.className = 'actions';
    const add = (text,fn) => { const el = button(text,fn); el.dataset.focus = run.runId + ':' + text; el.disabled = busy; actions.append(el); return el; };
    add('Worked',() => mutate(run,{outcome:'worked'})).setAttribute('aria-pressed',String(run.outcome === 'worked'));
    add('Needs work',() => mutate(run,{outcome:'failed'})).setAttribute('aria-pressed',String(run.outcome === 'failed'));
    add('Clear outcome',() => mutate(run,{outcome:null}));
    add(run.bookmarked ? 'Unbookmark' : 'Bookmark',() => mutate(run,{bookmarked:!run.bookmarked}));
    const label = document.createElement('input'); label.type = 'text'; label.maxLength = 120;
    label.value = run.label || ''; label.setAttribute('aria-label','Short label for ' + (run.prompt || run.runId)); label.dataset.focus = run.runId + ':label';
    label.disabled = busy; actions.append(label);
    add('Save label',() => mutate(run,{label:label.value.trim() || null}));
    add('Delete run',() => { if (confirm('Delete this run and its trace permanently?')) mutate(run,null); }).className = 'danger';
    menu.append(actions); row.append(menu); list.append(row);
  }
  next.disabled = busy || loading || !nextCursor;
  if (focusId) for (const el of list.querySelectorAll('[data-focus]')) if (el.dataset.focus === focusId) { el.focus(); break; }
  updateRunHeader(); updateChips();
}
function relativeTime(time) {
  const minutes = Math.max(0,Math.floor((Date.now()-time)/60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? minutes + 'm ago' : minutes < 1440 ? Math.floor(minutes/60) + 'h ago' : new Date(time).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
let selectedSummary, summaryRequest;
function updateRunHeader() {
  selectedSummary = items.find(run => run.runId === selected) || (selectedSummary?.runId === selected ? selectedSummary : undefined);
  const run = selectedSummary;
  if (document.getElementById('nav-problems').getAttribute('aria-pressed') === 'true') return;
  if (!run && selected && summaryRequest !== selected) {
    const id = selected; summaryRequest = id;
    request('/api/runs/' + encodeURIComponent(id)).then(record => { if (selected === id && record?.runId === id) { selectedSummary = record; updateRunHeader(); } }).catch(() => { if (selected === id) document.getElementById('run-meta').textContent = 'Run details unavailable. Refresh history to retry.'; });
  }
  document.getElementById('run-title').textContent = run ? run.label || run.prompt || run.runId : selected ? 'Selected run' : 'Select a run';
  document.getElementById('run-meta').textContent = run ? [run.provider,run.model,run.status,'Outcome: ' + (run.outcome === 'worked' ? 'Worked' : run.outcome === 'failed' ? 'Needs work' : 'Unreviewed'),!items.includes(run) ? 'Outside current filters' : ''].filter(Boolean).join(' · ') : 'Follow your agents and inspect recorded evidence.';
}
function updateChips() {
  const chips = document.getElementById('filter-chips'); chips.replaceChildren();
  for (const [key,value] of new FormData(form)) if (value) chips.append(button(key + ': ' + value + ' ×',() => { form.elements.namedItem(key).value = ''; cursor = undefined; stack = []; persistFilters(); load(); }));
  for (const el of document.querySelectorAll('[data-quick]')) {
    const quick = el.dataset.quick;
    el.setAttribute('aria-pressed',String(quick === 'all' ? !form.elements.status.value && !form.elements.bookmarked.value : quick === 'bookmarked' ? form.elements.bookmarked.value === 'true' : form.elements.status.value === quick));
  }
}
function persistFilters() {
  const params = new URLSearchParams(location.search);
  for (const [key,value] of new FormData(form)) { if (value) params.set(key,value); else params.delete(key); }
  history.replaceState(null,'','?' + params); updateChips();
}
function query() {
  const params = new URLSearchParams({limit:'20'});
  for (const [key,value] of new FormData(form)) if (value) {
    if (key === 'from' || key === 'to') {
      const time = new Date(value + (key === 'to' ? 'T23:59:59.999' : 'T00:00:00')).getTime();
      params.set(key,String(time));
    } else params.set(key,value);
  }
  if (cursor) params.set('cursor',cursor);
  return params;
}
async function load(append = false) {
  const ticket = ++generation;
  loading = true; list.inert = true; next.disabled = true;
  notice.textContent = 'Loading history…'; list.setAttribute('aria-busy','true');
  try {
    const page = await request('/api/runs?' + query());
    if (ticket !== generation) return false;
    items = append ? [...new Map([...items,...page.items].map(run => [run.runId,run])).values()].slice(-200) : page.items; nextCursor = page.nextCursor;
    if (!selected && items.length) selectRun(items[0].runId);
    loading = false;
    notice.textContent = items.length + ' runs loaded' + (items.length === 200 ? ' · Showing latest loaded 200' : ''); draw(); return true;
  } catch (error) { if (ticket === generation) notice.textContent = error.message + '. Use Refresh history to retry.'; return false; }
  finally { if (ticket === generation) { loading = false; list.inert = false; list.setAttribute('aria-busy','false'); next.disabled = busy || !nextCursor; } }
}
async function mutate(run, patch) {
  if (busy || loading) return;
  const active = document.activeElement;
  const focusKey = active && active.dataset.focus;
  busy = true; ++generation;
  // Pessimistic mutation: keep the confirmed row and label draft intact on failure.
  const controls = [...list.querySelectorAll('button,input')];
  const disabled = controls.map(el => el.disabled); controls.forEach(el => el.disabled = true);
  notice.textContent = 'Saving…';
  try {
    const updated = await request('/api/runs/' + encodeURIComponent(run.runId),patch === null ? {method:'DELETE'} : {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
    if (!updated && selected === run.runId) { selected = null; map.removeAttribute('events-url'); }
    saveUrl(); busy = false;
    // Restart at page one after mutation so rows removed by filters cannot strand an empty page.
    cursor = undefined; stack = [];
    items = updated ? items.map(item => item.runId === run.runId ? updated : item) : items.filter(item => item.runId !== run.runId);
    draw(); await load();
    if (focusKey) {
      const targets = [...list.querySelectorAll('[data-focus]')];
      const target = targets.find(el => el.dataset.focus === focusKey) || targets.find(el => el.dataset.focus === run.runId + ':open');
      if (target) target.focus(); else { notice.tabIndex = -1; notice.focus(); }
    }
  } catch (error) { busy = false; controls.forEach((el,i) => el.disabled = disabled[i]); if (active && active.isConnected) active.focus(); notice.textContent = error.message + '. Request not confirmed. Retry the action or refresh history.'; }
}
form.addEventListener('submit',event => { event.preventDefault(); if (busy) return; cursor = undefined; stack = []; persistFilters(); load(); });
form.addEventListener('change',() => { if (busy) return; cursor = undefined; stack = []; persistFilters(); load(); });
let searchTimer;
document.getElementById('filter-query').addEventListener('input',() => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (!busy) { cursor = undefined; stack = []; persistFilters(); load(); } },250); });
next.addEventListener('click',async () => { if (busy || loading || !nextCursor) return; const old = cursor; stack.push(cursor); cursor = nextCursor; const ticket = generation + 1; if (!await load(true) && ticket === generation) { cursor = old; stack.pop(); next.disabled = !nextCursor; } });
for (const [key,value] of new URLSearchParams(location.search)) { const input = form.elements.namedItem(key); if (input && 'value' in input) input.value = value; }
for (const el of document.querySelectorAll('[data-quick]')) el.addEventListener('click',() => { if (busy) return; form.elements.status.value = ['running','failed'].includes(el.dataset.quick) ? el.dataset.quick : ''; form.elements.bookmarked.value = el.dataset.quick === 'bookmarked' ? 'true' : ''; cursor = undefined; stack = []; persistFilters(); load(); });
document.getElementById('clear-filters').addEventListener('click',() => { if (busy) return; form.reset(); cursor = undefined; stack = []; persistFilters(); load(); });
window.addEventListener('popstate',event => {
  ++generation; loading = false; list.inert = false; list.setAttribute('aria-busy','false');
  const before = new URLSearchParams(new FormData(form)).toString(), params = new URLSearchParams(location.search);
  selected = params.get('session'); form.reset();
  for (const [key,value] of params) { const input = form.elements.namedItem(key); if (input && 'value' in input) input.value = value; }
  if (selected) map.setAttribute('events-url','/sse?session=' + encodeURIComponent(selected)); else map.removeAttribute('events-url');
  if (params.has('node')) map.setAttribute('selected-node',params.get('node')); else map.removeAttribute('selected-node');
  switchHistory(false); draw();
  if (before !== new URLSearchParams(new FormData(form)).toString()) { cursor = undefined; stack = []; load(); }
  document.querySelector('.history-scroll').scrollTop = event.state?.scroll || 0;
});
if (selected) { map.setAttribute('events-url','/sse?session=' + encodeURIComponent(selected)); } load();
`;

export function studioHistoryPage(provider: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${provider} · Run history</title><link rel="stylesheet" href="/styles.css">
  <style>${studioStyles}</style></head><body><div class="studio"><aside id="history-sidebar" class="rail" aria-label="Run history">
  <div class="rail-head"><div class="brand"><strong>Agent Think Map</strong><span class="local">● Local</span><button id="collapse-sidebar" type="button" aria-label="Collapse sidebar" title="Collapse sidebar" aria-controls="history-sidebar" aria-expanded="true">‹</button></div>
  <nav class="nav-tabs" aria-label="History views"><button id="nav-runs" aria-pressed="true">Runs</button><button id="nav-problems" aria-pressed="false">Problems</button></nav>
  <form id="history-filters">
  <div class="search-line"><label class="sr-only" for="filter-query">Search history</label><input id="filter-query" name="q" type="search" maxlength="256" placeholder="Search runs…"><button type="submit" title="Refresh history" aria-label="Refresh history">↻</button></div><div class="quick-views" aria-label="Quick filters"><button type="button" data-quick="all" aria-pressed="true">All</button><button type="button" data-quick="running">Active</button><button type="button" data-quick="failed">Failed</button><button type="button" data-quick="bookmarked">Bookmarked</button></div>
  <details class="filters"><summary>Filters</summary><div class="filter-grid">
  <label>Provider<select name="provider"><option value="">All providers</option>${["claude-code","codex","claude-sdk","openai","custom"].map(x=>`<option>${x}</option>`).join("")}</select></label>
  <label>Model (exact)<input name="model" maxlength="256"></label>
  <label>Origin<select name="origin"><option value="">All</option><option value="live">Live</option><option value="imported">Imported</option></select></label>
  <label>Status<select name="status"><option value="">All statuses</option>${["running","completed","failed","interrupted"].map(x=>`<option>${x}</option>`).join("")}</select></label>
  <label>Outcome<select name="outcome"><option value="">All outcomes</option><option value="worked">Worked</option><option value="failed">Needs work</option><option value="null">Unreviewed</option></select></label>
  <label>Bookmarks<select name="bookmarked"><option value="">All runs</option><option value="true">Bookmarked only</option><option value="false">Not bookmarked</option></select></label>
  <label>Updated from<input name="from" type="date"></label><label>Updated through<input name="to" type="date"></label>
  </div><button type="button" id="clear-filters">Clear all filters</button></details><div id="filter-chips" class="chips"></div></form>
  <p id="problem-scope" class="muted" hidden>Observed errors across local runs. Run filters do not apply.</p></div>
  <div class="history-scroll"><div id="sessions" aria-busy="true">Loading history…</div><div id="problem-list" hidden></div></div>
  <footer class="rail-footer"><p id="notice" role="status" aria-live="polite"></p><nav class="paging" aria-label="More history"><button id="next" type="button" disabled>Load more</button></nav></footer>
  </aside><div id="sidebar-resizer" class="sidebar-resizer" role="separator" aria-label="Resize history sidebar" aria-orientation="vertical" aria-controls="history-sidebar" tabindex="0"></div><main class="workspace"><header class="run-header"><div class="run-heading"><button id="expand-sidebar" type="button" aria-label="Expand sidebar" aria-controls="history-sidebar" aria-expanded="false" hidden>☰ History</button><div><h1 id="run-title">Select a run</h1><p id="run-meta">Follow your agents and inspect recorded evidence.</p></div></div>
  <nav class="workspace-tabs" aria-label="Run views"><button data-view="trace" aria-pressed="true">Trace</button><button data-view="overview" aria-pressed="false">Overview</button><button data-view="agents" aria-pressed="false">Agents</button></nav></header>
  <div class="workspace-body"><section id="investigation" class="investigation" hidden aria-live="polite"></section><agent-think-map id="map" layout="split" replay="false"></agent-think-map></div></main></div>
  <script type="module" src="/element.js"></script><script>${sidebarClient}${historyClient}${investigationClient}</script></body></html>`;
}
