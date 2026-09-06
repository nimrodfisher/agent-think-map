/** One client for both providers. Only the current API page is retained in memory. */
export const historyClient = String.raw`
const list = document.getElementById('sessions');
const map = document.getElementById('map');
const form = document.getElementById('history-filters');
const notice = document.getElementById('notice');
const baselineText = document.getElementById('baseline');
const next = document.getElementById('next');
const previous = document.getElementById('previous');
let selected = new URLSearchParams(location.search).get('session');
let baseline = new URLSearchParams(location.search).get('baseline');
let items = [], cursor, nextCursor, stack = [], generation = 0, busy = false, loading = false;
function showBaseline() {
  baselineText.textContent = baseline ? 'Baseline selected: ' + baseline + '. Saved in this page URL for later comparison.' : 'No baseline selected. Mark a successful run Worked, then choose it as baseline.';
  document.getElementById('clear-baseline').disabled = !baseline;
}
function saveUrl() {
  const params = new URLSearchParams(location.search);
  for (const [key,value] of [['session',selected],['baseline',baseline]]) { if (value) params.set(key,value); else params.delete(key); }
  history.replaceState(null,'','?' + params);
  showBaseline();
}
function selectRun(id) {
  selected = id;
  map.setAttribute('events-url','/sse?session=' + encodeURIComponent(id));
  saveUrl();
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
  list.replaceChildren();
  if (!items.length) list.textContent = 'No runs match. Change the filters or record a run.';
  for (const run of items) {
    const row = document.createElement('article'); row.className = 'session-row';
    const title = button(run.label || run.prompt || run.runId,() => { selectRun(run.runId); draw(); });
    title.className = 'session'; title.dataset.focus = run.runId + ':open';
    if (run.runId === selected) title.setAttribute('aria-current','true');
    row.append(title);
    const meta = document.createElement('p');
    meta.textContent = [run.provider,run.model,run.status,run.outcome ? 'Outcome: ' + run.outcome : 'Outcome: unlabeled',run.bookmarked ? 'Bookmarked' : '',new Date(run.updatedAt).toLocaleString(),run.eventCount + ' events'].filter(Boolean).join(' · ');
    row.append(meta);
    const actions = document.createElement('div'); actions.className = 'actions';
    const add = (text,fn) => { const el = button(text,fn); el.dataset.focus = run.runId + ':' + text; el.disabled = busy; actions.append(el); return el; };
    add('Worked',() => mutate(run,{outcome:'worked'})).setAttribute('aria-pressed',String(run.outcome === 'worked'));
    add('Failed',() => mutate(run,{outcome:'failed'})).setAttribute('aria-pressed',String(run.outcome === 'failed'));
    add('Clear outcome',() => mutate(run,{outcome:null}));
    add(run.bookmarked ? 'Unbookmark' : 'Bookmark',() => mutate(run,{bookmarked:!run.bookmarked}));
    const label = document.createElement('input'); label.type = 'text'; label.maxLength = 120;
    label.value = run.label || ''; label.setAttribute('aria-label','Short label for ' + (run.prompt || run.runId)); label.dataset.focus = run.runId + ':label';
    label.disabled = busy; actions.append(label);
    add('Save label',() => mutate(run,{label:label.value.trim() || null}));
    add('Choose baseline',() => { baseline = run.runId; saveUrl(); }).disabled = busy || run.outcome !== 'worked';
    add('Delete run',() => { if (confirm('Delete this run and its trace permanently?')) mutate(run,null); });
    row.append(actions); list.append(row);
  }
  previous.disabled = busy || loading || !stack.length; next.disabled = busy || loading || !nextCursor;
  if (focusId) for (const el of list.querySelectorAll('[data-focus]')) if (el.dataset.focus === focusId) { el.focus(); break; }
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
async function load() {
  const ticket = ++generation;
  loading = true; list.inert = true; previous.disabled = true; next.disabled = true;
  notice.textContent = 'Loading history…'; list.setAttribute('aria-busy','true');
  try {
    const page = await request('/api/runs?' + query());
    if (ticket !== generation) return false;
    items = page.items; nextCursor = page.nextCursor;
    if (!selected && items.length) selectRun(items[0].runId);
    loading = false;
    notice.textContent = 'Page ' + (stack.length + 1) + ' · ' + items.length + ' runs'; draw(); return true;
  } catch (error) { if (ticket === generation) notice.textContent = error.message + '. Use Search / refresh to retry.'; return false; }
  finally { if (ticket === generation) { loading = false; list.inert = false; list.setAttribute('aria-busy','false'); previous.disabled = busy || !stack.length; next.disabled = busy || !nextCursor; } }
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
    if (baseline === run.runId && (!updated || updated.outcome !== 'worked')) baseline = null;
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
form.addEventListener('submit',event => { event.preventDefault(); if (busy) return; cursor = undefined; stack = []; load(); });
form.addEventListener('change',() => { if (busy) return; cursor = undefined; stack = []; load(); });
let searchTimer;
document.getElementById('filter-query').addEventListener('input',() => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (!busy) { cursor = undefined; stack = []; load(); } },250); });
next.addEventListener('click',async () => { if (busy || loading || !nextCursor) return; const old = cursor; stack.push(cursor); cursor = nextCursor; const ticket = generation + 1; if (!await load() && ticket === generation) { cursor = old; stack.pop(); previous.disabled = !stack.length; next.disabled = !nextCursor; } });
previous.addEventListener('click',async () => { if (busy || loading || !stack.length) return; const old = cursor; cursor = stack.pop(); const ticket = generation + 1; if (!await load() && ticket === generation) { stack.push(cursor); cursor = old; previous.disabled = !stack.length; next.disabled = !nextCursor; } });
document.getElementById('clear-baseline').addEventListener('click',() => { baseline = null; saveUrl(); });
showBaseline(); if (selected) selectRun(selected); load();
`;

export function studioHistoryPage(provider: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${provider} · Run history</title><link rel="stylesheet" href="/styles.css">
  <style>
  html, body { margin:0; height:100%; overflow: hidden; background:#e4d9c5; font-family:Excalifont,"Segoe UI",sans-serif; }
  .studio { display:grid; grid-template-columns:minmax(300px, 360px) minmax(0,1fr); grid-template-rows: minmax(0, 1fr); height:100%; }
  .rail { overflow:auto; padding:16px; background:#f6f0e4; } h1 {font-size:1.2rem} p {font-size:.85rem}
  form {display:grid;gap:8px} .filter-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding-top:8px} summary {cursor:pointer} label {display:grid;gap:3px} input,select,button {font:inherit;padding:6px;min-width:0}
  button {cursor:pointer} button:disabled {cursor:default} button:focus-visible,input:focus-visible,select:focus-visible {outline:3px solid #1f6f5b;outline-offset:2px}
  .session-row {border-top:1px solid #c9bba3;padding:12px 0}.session {width:100%;text-align:left;overflow-wrap:anywhere}
  .session[aria-current=true],button[aria-pressed=true] {background:#e8f0ec;border:2px solid #1f6f5b}
  .actions {display:flex;flex-wrap:wrap;gap:5px}.actions input {width:100%} #notice {min-height:2em}
  agent-think-map {display:flex;flex-direction:column;min-width:0;min-height:0;height:100%}
  </style></head><body><div class="studio"><aside class="rail">
  <h1>Run history</h1><p>${provider} Studio · Local traces from all providers.</p>
  <p>Find a run → mark Worked or Failed → choose a Worked baseline. Outcomes are your judgment. Comparison is coming later.</p>
  <form id="history-filters">
  <label>Search history<input id="filter-query" name="q" type="search" maxlength="256" placeholder="Prompt, tool, model, answer, error"></label>
  <details><summary>Filters: provider, model, status, outcome, date</summary><div class="filter-grid">
  <label>Provider<select name="provider"><option value="">All providers</option>${["claude-code","codex","claude-sdk","openai","custom"].map(x=>`<option>${x}</option>`).join("")}</select></label>
  <label>Model (exact)<input name="model" maxlength="256"></label>
  <label>Status<select name="status"><option value="">All statuses</option>${["running","completed","failed","interrupted"].map(x=>`<option>${x}</option>`).join("")}</select></label>
  <label>Outcome<select name="outcome"><option value="">All outcomes</option><option value="worked">Worked</option><option value="failed">Failed</option><option value="null">Unlabeled</option></select></label>
  <label>Bookmarks<select name="bookmarked"><option value="">All runs</option><option value="true">Bookmarked only</option><option value="false">Not bookmarked</option></select></label>
  <label>Updated from<input name="from" type="date"></label><label>Updated through<input name="to" type="date"></label>
  </div></details><button type="submit">Search / refresh</button></form>
  <p id="baseline"></p><button id="clear-baseline" type="button">Clear baseline</button>
  <p id="notice" role="status" aria-live="polite"></p>
  <nav aria-label="History pages"><button id="previous" type="button" disabled>Previous</button> <button id="next" type="button" disabled>Next</button></nav><div id="sessions" aria-busy="true">Loading history…</div>
  </aside><agent-think-map id="map" layout="split" replay="false"></agent-think-map></div>
  <script type="module" src="/element.js"></script><script>${historyClient}</script></body></html>`;
}
