/** Shared, local-only comparison UI. DOM textContent is used for all trace data. */
export const diffClient = String.raw`
const comparison = document.getElementById('comparison');
const picker = document.getElementById('baseline-picker');
let comparingBad, pickerCursor, pickerGeneration = 0, comparisonGeneration = 0;
let currentDiff;
let pickerReturnFocus;
function dismissPicker() {
  ++pickerGeneration; picker.hidden = true;
  document.querySelector('.rail').inert = false; document.querySelector('.workspace').inert = false;
  if (pickerReturnFocus?.isConnected) pickerReturnFocus.focus();
}
function closeComparison() { ++comparisonGeneration; comparison.hidden = true; map.hidden = false; document.getElementById('investigation').hidden = true; for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed',String(tab.dataset.view === 'trace')); }
async function openPicker(id) {
  pickerReturnFocus = document.activeElement;
  comparingBad = id; picker.hidden = false; pickerCursor = undefined;
  document.querySelector('.rail').inert = true; document.querySelector('.workspace').inert = true;
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
      const choice = button([run.label || run.prompt || run.runId,run.outcome || 'Unlabeled',run.provider,run.model || 'Unknown model',new Date(run.updatedAt).toLocaleString()].join(' · '),() => {
        if (run.outcome !== 'worked' && !confirm('This baseline is not labeled Worked. Intentionally compare with it?')) return;
        baseline = run.runId; selected = comparingBad; saveUrl(); compareSelected();
      });
      choices.append(choice);
    }
    if (!choices.children.length) choices.textContent = 'No eligible runs on this page. Search again or record and mark a successful run Worked.';
    pickerCursor = page.nextCursor; document.getElementById('picker-next').disabled = !pickerCursor;
  } catch (error) { if (ticket === pickerGeneration) choices.textContent = error.message + '. Retry Search baselines.'; }
}
async function compareSelected() {
  if (!selected || !baseline) return;
  if (!picker.hidden) dismissPicker();
  ++viewGeneration; investigation.hidden = true;
  const ticket = ++comparisonGeneration;
  comparison.hidden = false; map.hidden = true;
  comparison.replaceChildren(); comparison.append(button('Back to trace',closeComparison));
  const status = document.createElement('p'); status.setAttribute('role','status'); status.textContent = 'Comparing selected runs…'; comparison.append(status);
  try {
    const diff = await request('/api/diffs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({badRunId:selected,goodRunId:baseline})});
    if (ticket !== comparisonGeneration) return;
    dismissPicker(); currentDiff = diff; renderDiff(diff);
  } catch (error) { if (ticket === comparisonGeneration) { status.textContent = error.message + '. Refresh history or choose another baseline.'; comparison.append(button('Retry comparison',compareSelected)); } }
}
function renderDiff(diff) {
  comparison.replaceChildren();
  const toolbar = document.createElement('div'); toolbar.className = 'diff-toolbar';
  toolbar.append(button('Back to trace',closeComparison));
  const first = button('First divergence',() => selectDifference(diff.firstDivergence)); first.disabled = diff.firstDivergence === undefined; toolbar.append(first);
  const heading = document.createElement('h2'); heading.textContent = 'First meaningful difference'; toolbar.append(heading);
  const warnings = document.createElement('p'); warnings.textContent = diff.warnings.join(' '); toolbar.append(warnings);
  const summary = document.createElement('p'); summary.setAttribute('role','status'); summary.textContent = diff.firstDivergence === undefined ? 'No meaningful difference detected by this provisional analyzer.' : 'Select First divergence to inspect the aligned evidence.'; toolbar.append(summary);
  comparison.append(toolbar);
  const body = document.createElement('div'); body.className = 'diff-body';
  const rail = document.createElement('nav'); rail.className = 'change-rail'; rail.setAttribute('aria-label','Changes');
  const panes = ['good','bad'].map(side => { const pane = document.createElement('section'); pane.className = 'diff-pane'; pane.dataset.side = side; pane.setAttribute('aria-label',side === 'good' ? 'Worked baseline route' : 'Failed run route'); const h = document.createElement('h3'); h.textContent = (side === 'good' ? 'Worked baseline: ' + diff.goodRunId : 'Failed candidate: ' + diff.badRunId); pane.append(h); return pane; });
  function selectDifference(index) {
    if (index === undefined) return;
    for (const el of comparison.querySelectorAll('[data-diff-row]')) { const active = Number(el.dataset.diffRow) === index; el.classList.toggle('diff-selected',active); el.setAttribute('aria-current',String(active)); }
    for (const pane of panes) { const el = pane.querySelector('[data-diff-row="' + index + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({block:'center',behavior:'auto'}); }
    const row = diff.rows[index]; summary.textContent = row.classification + ' · ' + row.confidence + ' confidence · ' + row.reason;
    const target = rail.querySelector('[data-diff-row="' + index + '"]'); if (target) target.focus({preventScroll:true});
  }
  diff.rows.forEach((row,index) => {
    const action = button((index+1) + ' · ' + row.classification,() => selectDifference(index)); action.dataset.diffRow = index; action.className = 'diff-' + row.classification; rail.append(action);
    panes.forEach((pane,sideIndex) => {
      const side = sideIndex ? 'bad' : 'good', ordinal = row[side + 'Ordinal'];
      const step = diff[side].steps.find(step => step.ordinal === ordinal);
      const card = document.createElement('article'); card.dataset.diffRow = index; card.className = 'diff-step diff-' + row.classification;
      const title = button(step ? 'Turn ' + step.turnOrdinal + ' · Step ' + (step.ordinal+1) + ' · ' + step.operation.name : 'No corresponding step',() => selectDifference(index)); card.append(title);
      const evidence = document.createElement('p'); evidence.textContent = row.classification + ' · ' + row.confidence + ' confidence · ' + row.reason; card.append(evidence);
      if (step) {
        const details = document.createElement('p'); details.textContent = [step.kind,step.status,step.durationMs === undefined ? 'Duration unavailable' : step.durationMs + ' ms',step.costUsd === undefined ? 'Cost unavailable' : '$' + step.costUsd,step.usage ? 'Tokens: ' + (step.usage.inputTokens ?? '?') + ' in / ' + (step.usage.outputTokens ?? '?') + ' out' : 'Tokens unavailable','Output: ' + (step.outputClass || 'unavailable'),'Identity: ' + step.identitySource].join(' · '); card.append(details);
        if (step.error) { const error = document.createElement('p'); error.textContent = 'Error: ' + step.error; card.append(error); }
        const shape = document.createElement('pre'); shape.textContent = JSON.stringify(step.inputShape,null,2); card.append(shape);
        const inspect = button('Inspect original step',async() => {
          inspect.disabled = true;
          try {
            const events = await request('/api/runs/' + encodeURIComponent(side === 'good' ? diff.goodRunId : diff.badRunId) + '/events');
            const raw = document.createElement('pre'); raw.textContent = JSON.stringify(events.items.map(e=>e.payload).filter(e=>e.id===step.nodeId),null,2); card.append(raw); inspect.remove();
          } catch(error) { evidence.textContent = error.message; inspect.disabled = false; }
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
document.getElementById('compare-selected').addEventListener('click',() => { if (selected && baseline) compareSelected(); else if (selected) openPicker(selected); });
`;
export const diffMarkup = `<section id="baseline-picker" hidden role="dialog" aria-modal="true" aria-label="Choose Worked baseline">
<h2>Choose a Worked baseline</h2><form id="picker-search"><label>Search baselines<input id="picker-query" type="search" maxlength="256"></label><label><input id="picker-other" type="checkbox">Include other outcomes (intentional comparison)</label><button>Search baselines</button></form><div id="baseline-choices"></div><button id="picker-next" disabled>More baselines</button><button id="picker-close">Close picker</button></section>`;
