/** Shared, local-only comparison UI. DOM textContent is used for all trace data. */
export const diffClient = String.raw`
const comparison = document.createElement('section'); comparison.id = 'comparison'; comparison.hidden = true; document.querySelector('.workspace-body').append(comparison);
const picker = document.getElementById('baseline-picker');
const comparisonNotice = document.createElement('p'); comparisonNotice.hidden = true; comparisonNotice.setAttribute('role','status'); document.querySelector('.run-header').append(comparisonNotice);
function comparisonError(message) { notice.textContent = message; comparisonNotice.textContent = message; comparisonNotice.hidden = false; }
let comparingBad, pickerCursor, pickerGeneration = 0, comparisonGeneration = 0;
let currentDiff, baseline, traceSnapshot;
const comparisonRuns = new Map();
let pickerReturnFocus;
function dismissPicker() {
  if (picker.hidden) return;
  ++pickerGeneration; picker.hidden = true;
  document.querySelector('.rail').inert = false; document.querySelector('.workspace').inert = false;
  document.getElementById('sidebar-resizer').inert = false;
  if (pickerReturnFocus?.isConnected) pickerReturnFocus.focus();
}
function baselineUrl(value) { const params = new URLSearchParams(location.search); if (value) params.set('baseline',value); else params.delete('baseline'); history.replaceState(history.state,'','?' + params); }
function invalidateComparison(clearUrl = true) { ++comparisonGeneration; dismissPicker(); currentDiff = undefined; baseline = undefined; traceSnapshot = undefined; comparison.hidden = true; comparison.replaceChildren(); comparisonNotice.hidden = true; if (clearUrl) baselineUrl(); }
function closeComparison() {
  const snapshot = traceSnapshot; invalidateComparison(); showView('trace');
  if (snapshot && snapshot.run === selected) {
    if (snapshot.node) map.setAttribute('selected-node',snapshot.node); else map.removeAttribute('selected-node');
    document.querySelector('.history-scroll').scrollTop = snapshot.scroll;
  }
}
async function restoreComparisonUrl() {
  const value = new URLSearchParams(location.search).get('baseline');
  if (!value) return;
  if (!selected || value === selected) { baselineUrl(); comparisonError('Baseline unavailable. Showing trace.'); return; }
  baseline = value; await compareSelected(true);
}
function outcomeLabel(run) { return run?.outcome === 'worked' ? 'Worked' : run?.outcome === 'failed' ? 'Needs work' : 'Unreviewed'; }
function refreshComparisonHeadings() {
  if (!currentDiff) return;
  for (const side of ['good','bad']) {
    const id = side === 'good' ? currentDiff.goodRunId : currentDiff.badRunId, run = comparisonRuns.get(id);
    const heading = comparison.querySelector('[data-side="' + side + '"] h3');
    if (heading) heading.textContent = (side === 'good' ? 'Baseline' : 'Candidate') + ' · ' + outcomeLabel(run) + ': ' + (run?.label || run?.prompt || id);
  }
}
const matchEvidence = {
  'no-corresponding-step':'No corresponding step captured',
  'step-still-running':'A step is still running',
  'legacy-identity-unavailable':'Captured operation identity unavailable',
  'structural-identity-only':'Structural identity only',
  'same-operation-input-shape-differs':'Same operation; input structure differs',
  'repeated-fingerprint-order-tie-break':'Repeated fingerprint; paired by order',
  'exact-fingerprint-status-differs':'Exact fingerprint; status or output differs',
  'exact-fingerprint':'Unique captured operation and input structure'
};
function rowEvidence(row) { return row.classification + ' · ' + row.confidence + ' confidence · ' + (row.match === 'exact' ? 'Exact' : 'Inferred') + ' evidence · ' + (matchEvidence[row.matchBasis] || 'Evidence unavailable') + ' · ' + row.reason; }
// Mirror analyzer node creation/order, including synthetic users and reducer ID deduplication.
// Each restart closes a sequence range; user nodes advance the analyzer turn ordinal.
function originalEvidence(envelopes,step) {
  const nodes = []; let local = new Map(), turn = 0;
  for (const envelope of envelopes) {
    const e = envelope.payload;
    if (e.type === 'run.started') { local = new Map(); const node = {id:'user-' + e.runId,turn:++turn,events:[envelope]}; nodes.push(node); local.set(node.id,node); }
    else if (e.type === 'node.started' && !local.has(e.id)) { const node = {id:e.id,turn:e.kind === 'user' ? ++turn : turn,events:[envelope]}; nodes.push(node); local.set(e.id,node); }
    else if (e.id && local.has(e.id)) local.get(e.id).events.push(envelope);
  }
  const node = nodes[step.ordinal];
  return node?.id === step.nodeId && node.turn === step.turnOrdinal ? node.events : [];
}
async function openPicker(id) {
  comparisonNotice.hidden = true;
  pickerReturnFocus = document.activeElement;
  comparingBad = id; picker.hidden = false; pickerCursor = undefined;
  document.querySelector('.rail').inert = true; document.querySelector('.workspace').inert = true;
  document.getElementById('sidebar-resizer').inert = true;
  document.getElementById('picker-other').checked = false;
  document.getElementById('picker-query').value = '';
  document.getElementById('picker-query').focus(); await loadBaselines();
}
async function loadBaselines() {
  const ticket = ++pickerGeneration;
  const choices = document.getElementById('baseline-choices');
  choices.textContent = 'Loading baselines…'; document.getElementById('picker-next').disabled = true;
  const params = new URLSearchParams({limit:'20',q:document.getElementById('picker-query').value});
  if (!document.getElementById('picker-other').checked) params.set('outcome','worked');
  if (pickerCursor) params.set('cursor',pickerCursor);
  try {
    const page = await request('/api/runs?' + params);
    if (ticket !== pickerGeneration) return;
    choices.replaceChildren();
    for (const run of page.items.filter(run => run.runId !== comparingBad)) {
      const choice = button([run.label || run.prompt || run.runId,outcomeLabel(run),run.provider,run.model || 'Unknown model',new Date(run.updatedAt).toLocaleString()].join(' · '),() => {
        if (run.outcome !== 'worked' && !confirm('This baseline is not labeled Worked. Intentionally compare with it?')) return;
        comparisonRuns.set(run.runId,run); baseline = run.runId;
        history.replaceState({...history.state,scroll:document.querySelector('.history-scroll').scrollTop},'',location.href); history.pushState(history.state,'',location.href); baselineUrl(baseline); compareSelected();
      });
      choices.append(choice);
    }
    if (!choices.children.length) choices.textContent = 'No eligible runs on this page. Search again or record and mark a successful run Worked.';
    pickerCursor = page.nextCursor; document.getElementById('picker-next').disabled = !pickerCursor;
  } catch (error) { if (ticket === pickerGeneration) { dismissPicker(); comparisonError(error.message + '. Open Compare to retry baseline selection.'); } }
}
async function compareSelected(restoring = false) {
  if (!selected || !baseline) return;
  if (!picker.hidden) dismissPicker();
  if (!traceSnapshot) traceSnapshot = {run:selected,node:map.getAttribute('selected-node'),scroll:document.querySelector('.history-scroll').scrollTop};
  const ticket = ++comparisonGeneration;
  const candidateId = selected, baselineId = baseline;
  showView('compare');
  comparison.replaceChildren(); comparison.append(button('Back to trace',closeComparison));
  const status = document.createElement('p'); status.setAttribute('role','status'); status.textContent = 'Comparing selected runs…'; comparison.append(status);
  try {
    const record = id => items.find(run=>run.runId === id) || (selectedSummary?.runId === id ? selectedSummary : undefined) || comparisonRuns.get(id) || request('/api/runs/' + encodeURIComponent(id));
    const [candidate,good] = await Promise.all([record(candidateId),record(baselineId)]);
    if (ticket !== comparisonGeneration) return;
    if (candidate?.runId !== candidateId || good?.runId !== baselineId) throw new Error('Run or baseline unavailable');
    comparisonRuns.set(candidateId,candidate); comparisonRuns.set(baselineId,good);
    const diff = await request('/api/diffs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({badRunId:candidateId,goodRunId:baselineId})});
    if (ticket !== comparisonGeneration) return;
    currentDiff = diff; renderDiff(diff);
  } catch (error) { if (ticket === comparisonGeneration) { closeComparison(); comparisonError((restoring ? 'Baseline unavailable. Showing trace. ' : 'Comparison unavailable. ') + error.message); } }
}
function renderDiff(diff) {
  comparison.replaceChildren();
  const toolbar = document.createElement('div'); toolbar.className = 'diff-toolbar';
  toolbar.append(button('Back to trace',closeComparison));
  const first = button('First detected difference',() => selectDifference(diff.firstDivergence)); first.disabled = diff.firstDivergence === undefined; toolbar.append(first);
  const heading = document.createElement('h2'); heading.textContent = 'Compare recorded evidence'; toolbar.append(heading);
  const warnings = document.createElement('p'); warnings.textContent = diff.warnings.join(' '); toolbar.append(warnings);
  const summary = document.createElement('p'); summary.setAttribute('role','status'); summary.textContent = diff.firstDivergence === undefined ? 'No difference detected by this provisional analyzer.' : 'Select First detected difference to inspect the aligned evidence.'; toolbar.append(summary);
  toolbar.append(element('p','Alignment is provisional. A difference is a lead to investigate, not proven causation.','muted'));
  comparison.append(toolbar);
  const body = document.createElement('div'); body.className = 'diff-body';
  const rail = document.createElement('nav'); rail.className = 'change-rail'; rail.setAttribute('aria-label','Changes');
  const panes = ['good','bad'].map(side => { const pane = document.createElement('section'); pane.className = 'diff-pane'; pane.dataset.side = side; const id = side === 'good' ? diff.goodRunId : diff.badRunId, label = side === 'good' ? 'Baseline' : 'Candidate', run = comparisonRuns.get(id); pane.setAttribute('aria-label',label); const h = document.createElement('h3'); h.textContent = label + ' · ' + outcomeLabel(run) + ': ' + (run?.label || run?.prompt || id); pane.append(h); return pane; });
  function selectDifference(index) {
    if (index === undefined) return;
    scrolling = true; requestAnimationFrame(()=>scrolling=false);
    for (const el of comparison.querySelectorAll('[data-diff-row]')) { const active = Number(el.dataset.diffRow) === index; el.classList.toggle('diff-selected',active); el.setAttribute('aria-current',String(active)); }
    for (const pane of panes) { const el = pane.querySelector('[data-diff-row="' + index + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({block:'center',behavior:'auto'}); }
    const row = diff.rows[index]; summary.textContent = rowEvidence(row);
    const target = rail.querySelector('[data-diff-row="' + index + '"]'); if (target) target.focus({preventScroll:true});
  }
  diff.rows.forEach((row,index) => {
    const action = button((index+1) + ' · ' + row.classification + ' · ' + (row.match === 'exact' ? 'Exact' : 'Inferred'),() => selectDifference(index)); action.dataset.diffRow = index; action.className = 'diff-' + row.classification + ' diff-' + row.match; rail.append(action);
    panes.forEach((pane,sideIndex) => {
      const side = sideIndex ? 'bad' : 'good', ordinal = row[side + 'Ordinal'];
      const step = diff[side].steps.find(step => step.ordinal === ordinal);
      const card = document.createElement('article'); card.dataset.diffRow = index; card.className = 'diff-step diff-' + row.classification + ' diff-' + row.match;
      const title = button(step ? 'Turn ' + step.turnOrdinal + ' · Step ' + (step.ordinal+1) + ' · ' + step.operation.name : 'No corresponding step',() => selectDifference(index)); card.append(title);
      const evidence = document.createElement('p'); evidence.textContent = rowEvidence(row); card.append(evidence);
      if (step) {
        const details = document.createElement('p'); details.textContent = [step.kind,step.status,step.durationMs === undefined ? 'Duration unavailable' : step.durationMs + ' ms',step.costUsd === undefined ? 'Cost unavailable' : '$' + step.costUsd,step.usage ? 'Tokens: ' + (step.usage.inputTokens ?? '?') + ' in / ' + (step.usage.outputTokens ?? '?') + ' out' : 'Tokens unavailable','Output: ' + (step.outputClass || 'unavailable'),'Identity: ' + step.identitySource].join(' · '); card.append(details);
        if (step.error) { const error = document.createElement('p'); error.textContent = 'Error: ' + step.error; card.append(error); }
        const shape = document.createElement('pre'); shape.textContent = JSON.stringify(step.inputShape,null,2); card.append(shape);
        const inspect = button('Inspect original step',async() => {
          const ticket = comparisonGeneration;
          inspect.disabled = true;
          try {
            const events = await request('/api/runs/' + encodeURIComponent(side === 'good' ? diff.goodRunId : diff.badRunId) + '/events');
            if (ticket !== comparisonGeneration || !card.isConnected) return;
            const raw = document.createElement('pre'); const scoped = originalEvidence(events.items,step); raw.textContent = scoped.length ? JSON.stringify(scoped,null,2) : 'Original evidence unavailable for this step boundary.'; card.append(raw); inspect.remove();
          } catch(error) { if (ticket === comparisonGeneration && card.isConnected) { card.append(element('p',error.message)); inspect.disabled = false; } }
        }); card.append(inspect);
      }
      pane.append(card);
    });
  });
  let scrolling = false;
  panes.forEach((pane,i) => pane.addEventListener('scroll',() => { if (scrolling) return; scrolling = true; const other = panes[1-i]; other.scrollTop = pane.scrollTop / Math.max(1,pane.scrollHeight-pane.clientHeight) * (other.scrollHeight-other.clientHeight); requestAnimationFrame(()=>scrolling=false); }));
  body.append(rail,...panes); comparison.append(body);
}
document.getElementById('picker-search').addEventListener('submit',event => { event.preventDefault(); pickerCursor = undefined; loadBaselines(); });
document.getElementById('picker-other').addEventListener('change',() => { pickerCursor = undefined; loadBaselines(); });
document.getElementById('picker-next').addEventListener('click',loadBaselines);
document.getElementById('picker-close').addEventListener('click',dismissPicker);
picker.addEventListener('keydown',event => {
  if (event.key === 'Escape') { event.preventDefault(); dismissPicker(); }
  if (event.key === 'Tab') {
    const controls = [...picker.querySelectorAll('button:not(:disabled),input:not(:disabled)')], first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
document.getElementById('compare-selected').addEventListener('click',() => { if (selected) openPicker(selected); });
if (initialParams.has('baseline')) historyReady.then(() => { if (typeof location !== 'undefined' && comparisonGeneration === 0) restoreComparisonUrl(); });
`;
export const diffMarkup = `<section id="baseline-picker" hidden role="dialog" aria-modal="true" aria-label="Choose Worked baseline">
<h2>Choose a Worked baseline</h2><form id="picker-search"><label>Search baselines<input id="picker-query" type="search" maxlength="256"></label><label><input id="picker-other" type="checkbox">Include other outcomes (intentional comparison)</label><button>Search baselines</button></form><div id="baseline-choices"></div><button id="picker-next" disabled>More baselines</button><button id="picker-close">Close picker</button></section>`;
