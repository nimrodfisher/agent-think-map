/** Evidence stays local. Every trace-derived string is rendered as text. */
export const investigationClient = String.raw`
const investigation = document.getElementById('investigation');
let viewGeneration = 0, workspaceView = 'trace', problemGeneration = 0;
function element(tag,text,className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function metric(label,value) { const card = element('div',undefined,'metric'); card.append(element('small',label),element('strong',value)); return card; }
function duration(ms) { return ms === undefined ? 'Unavailable' : ms < 1000 ? Math.round(ms) + ' ms' : ms < 60000 ? (ms/1000).toFixed(1) + ' s' : (ms/60000).toFixed(1) + ' min'; }
function inspectStep(step) {
  showView('trace'); map.setAttribute('selected-node',step.id);
  map.tabIndex = -1; map.focus();
  const params = new URLSearchParams(location.search); params.set('node',step.id); history.replaceState(null,'','?' + params);
}
function stepsFrom(envelopes) {
  const steps = [], latest = new Map(); let turn = 0;
  for (const envelope of envelopes) {
    const event = envelope.payload;
    if (event.type === 'run.started') { turn++; latest.clear(); }
    if (event.type === 'node.started') {
      const step = {...event,sequence:envelope.sequence,turn,status:'running',parent:latest.get(event.parentId)};
      steps.push(step); latest.set(event.id,step);
    } else if (event.type === 'tool.input') {
      const step = latest.get(event.id); if (step) step.input = (step.input || '') + event.partial;
    } else if (['node.failed','node.completed'].includes(event.type)) {
      let step = latest.get(event.id);
      if (!step) { step = {id:event.id,title:'Unidentified step',sequence:envelope.sequence,turn,ts:event.ts,kind:'unknown'}; steps.push(step); latest.set(event.id,step); }
      step.status = event.type === 'node.failed' ? 'failed' : 'completed'; if (event.error) step.error = event.error; if (event.outputPreview !== undefined) step.output = event.outputPreview; step.durationMs = event.durationMs ?? Math.max(0,event.ts-step.ts);
    }
  }
  return steps;
}
function pathFor(step) { const path = [], seen = new Set(); let at = step; while (at && !seen.has(at)) { seen.add(at); path.unshift(at.title); at = at.parent; } return path.join(' → '); }
function nextCheck(error) {
  if (/permission denied|eacces|forbidden|403/i.test(error)) return 'Inspect the requested resource and the execution identity. Check the recorded permissions before retrying.';
  if (/timeout|timed out|etimedout/i.test(error)) return 'Inspect the preceding request, elapsed time, and service response. Compare with a successful call before changing timeout or retry settings.';
  if (/429|rate.limit|too many requests/i.test(error)) return 'Inspect the response for retry timing and compare concurrent calls. Check whether a later attempt succeeded.';
  if (/not found|enoent|404/i.test(error)) return 'Inspect the exact resource or path and the preceding step that produced it. Compare with a run where that resource existed.';
  return 'Inspect the original error and preceding handoff. Compare this operation with a Worked run to test a possible explanation.';
}
function evidence(step,steps) {
  const card = element('article',undefined,'evidence-card');
  card.append(element('h3',step.title || step.id),element('p',pathFor(step)),element('pre',step.error || step.output || 'No output captured.'));
  if (step.input) { const input = element('details'); input.append(element('summary','Recorded input'),element('pre',step.input)); card.append(input); }
  if (step.error && step.output) { card.append(element('h3','Subsequent recorded output'),element('pre',step.output)); }
  if (step.error) { card.append(element('strong','Next check'),element('p',nextCheck(step.error)),element('p','Suggested check based on the recorded error; this is not a confirmed cause.','muted')); }
  // The live canvas reducer represents the latest turn. Never select an older duplicate ID there.
  if (steps.filter(other => other.id === step.id).length === 1 && step.turn === steps.reduce((latest,other) => Math.max(latest,other.turn),0)) card.append(button('Locate in trace',() => inspectStep(step)));
  card.append(element('small','Recorded step ' + step.sequence + ' · Turn ' + step.turn + ' · ' + step.status));
  return card;
}
async function showView(view) {
  workspaceView = view; const ticket = ++viewGeneration;
  map.hidden = view !== 'trace'; investigation.hidden = view === 'trace';
  for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed',String(tab.dataset.view === view));
  if (view === 'trace') return;
  investigation.scrollTop = 0;
  map.removeAttribute('selected-node');
  investigation.replaceChildren(element('p',selected ? 'Loading recorded evidence…' : 'Select a run to inspect its evidence.'));
  if (!selected) return;
  const id = selected;
  try {
    const result = await request('/api/runs/' + encodeURIComponent(id) + '/events');
    if (ticket !== viewGeneration || id !== selected) return;
    const steps = stepsFrom(result.items), failures = steps.filter(step => step.error), agents = steps.filter(step => step.kind === 'subagent');
    investigation.replaceChildren();
    if (view === 'overview') {
      investigation.append(element('h2','Run overview'),element('p',selectedSummary?.prompt || result.items.find(event => event.payload.type === 'run.started')?.payload.prompt || 'Original request unavailable.'));
      const cards = element('div',undefined,'cards'), run = selectedSummary;
      cards.append(metric('Recorded steps',steps.length),metric('Subagents',agents.length),metric('Observed errors',failures.length),metric('Duration',duration(run?.endedAt !== undefined && run?.startedAt !== undefined ? run.endedAt-run.startedAt : undefined)),metric('Captured cost',run?.usage?.costUsd === undefined ? 'Unavailable' : '$' + run.usage.costUsd.toFixed(3)));
      investigation.append(cards,element('h3','Observed problems'));
      if (!failures.length) investigation.append(element('p','No step errors recorded. This does not establish that the result was correct.'));
      for (const step of failures) investigation.append(evidence(step,steps));
      const answer = [...steps].reverse().find(step => step.kind === 'answer' && step.output);
      if (answer) { investigation.append(element('h3','Recorded result'),evidence(answer,steps)); }
    } else {
      investigation.append(element('h2','Agent handoffs'),element('p','Follow captured delegation paths. Relationships across separate runs are not recorded here.'));
      if (!agents.length) investigation.append(element('p','No subagent handoffs were captured in this run. Tool activity is available in Trace.'));
      for (const agent of agents) {
        const card = element('section',undefined,'agent-row');
        card.append(element('h3',agent.title),element('p',pathFor(agent)),element('p',agent.status + ' · ' + duration(agent.durationMs)));
        if (agent.parentId && !agent.parent) card.append(element('p','Parent not captured.','muted'));
        if (agent.reason) card.append(element('p','Delegation: ' + agent.reason));
        if (agent.output) card.append(element('p','Returned: ' + agent.output));
        const children = steps.filter(step => { let at = step.parent; while (at) { if (at === agent) return true; at = at.parent; } return false; });
        const details = element('details'); details.append(element('summary',children.length + ' recorded steps · ' + children.filter(step => step.error).length + ' errors'));
        for (const child of children) details.append(evidence(child,steps));
        card.append(details);
        if (steps.filter(other => other.id === agent.id).length === 1 && agent.turn === steps.reduce((latest,other) => Math.max(latest,other.turn),0)) card.append(button('Locate agent in trace',() => inspectStep(agent)));
        investigation.append(card);
      }
    }
  } catch(error) { if (ticket === viewGeneration) investigation.replaceChildren(element('p',error.message),button('Retry',() => showView(view))); }
}
function switchHistory(problems) {
  document.getElementById('nav-runs').setAttribute('aria-pressed',String(!problems)); document.getElementById('nav-problems').setAttribute('aria-pressed',String(problems));
  form.hidden = problems; list.hidden = problems; document.querySelector('.paging').hidden = problems; document.getElementById('problem-scope').hidden = !problems; document.getElementById('problem-list').hidden = !problems;
  document.querySelector('.workspace-tabs').hidden = problems;
  if (problems) {
    ++viewGeneration; map.hidden = true; investigation.hidden = false; investigation.scrollTop = 0;
    document.getElementById('run-title').textContent = 'Recurring problems'; document.getElementById('run-meta').textContent = 'Find repeated errors, inspect evidence, and choose the next check.';
    investigation.replaceChildren(element('h2','Find patterns across runs'),element('p','Select a problem to see affected runs and troubleshooting checks.')); loadProblems();
  } else { ++problemGeneration; updateRunHeader(); showView('trace'); notice.textContent = items.length + ' runs loaded'; }
}
async function loadProblems() {
  const ticket = ++problemGeneration, target = document.getElementById('problem-list'); target.replaceChildren(element('p','Loading observed problems…','empty'));
  try {
    const result = await request('/api/problems'); if (ticket !== problemGeneration) return;
    notice.textContent = result.items.length + ' problem groups' + (result.partial ? ' · Partial history' : '');
    target.replaceChildren();
    target.append(button('Refresh problems',loadProblems));
    if (result.partial) target.append(element('p','Partial results: newest 10,000 recorded errors. Counts cover this sample.','empty'));
    if (!result.items.length) target.append(element('p','No recorded step errors in local history.','empty'));
    for (const problem of result.items) {
      const row = button('',() => { for (const el of target.querySelectorAll('.problem-row')) el.removeAttribute('aria-current'); row.setAttribute('aria-current','true'); showProblem(problem); }); row.className = 'problem-row';
      row.append(element('strong',problem.operation),element('small',problem.message),element('small',problem.runCount + ' runs · ' + problem.count + ' occurrences · ' + relativeTime(problem.lastSeen)));
      if (problem.operation === 'Unidentified operation') row.append(element('small',problem.occurrences[0]?.title || 'Missing operation identity'));
      target.append(row);
    }
  } catch(error) { if (ticket === problemGeneration) target.replaceChildren(element('p',error.message,'empty'),button('Retry',loadProblems)); }
}
function showProblem(problem) {
  if (innerWidth <= 640 && !sidebarCollapsed) collapseSidebar.click();
  ++viewGeneration; map.hidden = true; investigation.hidden = false;
  investigation.scrollTop = 0;
  for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed','false');
  investigation.replaceChildren(element('h2',problem.operation),element('p',problem.runCount + ' affected runs · ' + problem.count + ' recorded occurrences'),element('p','Grouped by captured operation and exact error text. Similar wording may represent different causes.'));
  const card = element('article',undefined,'evidence-card'); card.append(element('h3','Observed error'),element('pre',problem.message),element('h3','Next check'),element('p',nextCheck(problem.message))); investigation.append(card,element('h3','Recent occurrences'));
  for (const occurrence of problem.occurrences) {
    const entry = element('article',undefined,'evidence-card');
    entry.append(element('h3',occurrence.title),element('p',occurrence.provider + ' · ' + new Date(occurrence.timestamp).toLocaleString() + ' · Step ' + occurrence.sequence));
    entry.append(button('Open run evidence',() => { switchHistory(false); selectRun(occurrence.runId,true); draw(); showView('overview'); })); investigation.append(entry);
  }
  if (problem.count > problem.occurrences.length) investigation.append(element('p','Showing the 20 most recent occurrences.','muted'));
}
for (const tab of document.querySelectorAll('[data-view]')) tab.addEventListener('click',() => showView(tab.dataset.view));
document.getElementById('nav-runs').addEventListener('click',() => switchHistory(false));
document.getElementById('nav-problems').addEventListener('click',() => switchHistory(true));
const initialNode = new URLSearchParams(location.search).get('node'); if (initialNode) map.setAttribute('selected-node',initialNode);
`;
