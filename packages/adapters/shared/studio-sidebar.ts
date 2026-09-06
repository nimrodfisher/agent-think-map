/** Shared Studio sidebar preferences. Storage may be unavailable in private/embedded contexts. */
export const sidebarClient = String.raw`
const studioShell = document.querySelector('.studio');
const historySidebar = document.getElementById('history-sidebar');
const sidebarResizer = document.getElementById('sidebar-resizer');
const collapseSidebar = document.getElementById('collapse-sidebar');
const expandSidebar = document.getElementById('expand-sidebar');
const sidebarPreferenceKey = 'agent-think-map.sidebar.v1';
let sidebarWidth = 320, sidebarCollapsed = false, sidebarDrag;
try {
  const saved = JSON.parse(localStorage.getItem(sidebarPreferenceKey) || 'null');
  if (saved && Number.isFinite(saved.width)) sidebarWidth = Math.max(240,Math.min(640,saved.width));
  sidebarCollapsed = saved?.collapsed === true;
} catch {}
function sidebarMaximum() { return Math.max(240,Math.min(640,innerWidth-368)); }
function renderSidebar() {
  const width = Math.max(240,Math.min(sidebarMaximum(),sidebarWidth));
  studioShell.style.setProperty('--history-width',width + 'px');
  studioShell.toggleAttribute('data-sidebar-collapsed',sidebarCollapsed);
  historySidebar.hidden = sidebarCollapsed; sidebarResizer.hidden = sidebarCollapsed;
  expandSidebar.hidden = !sidebarCollapsed;
  collapseSidebar.setAttribute('aria-expanded',String(!sidebarCollapsed));
  expandSidebar.setAttribute('aria-expanded',String(!sidebarCollapsed));
  sidebarResizer.setAttribute('aria-valuemin','240');
  sidebarResizer.setAttribute('aria-valuemax',String(sidebarMaximum()));
  sidebarResizer.setAttribute('aria-valuenow',String(width));
  sidebarResizer.setAttribute('aria-valuetext',width + ' pixels');
}
function saveSidebar() {
  try { localStorage.setItem(sidebarPreferenceKey,JSON.stringify({width:sidebarWidth,collapsed:sidebarCollapsed})); } catch {}
}
collapseSidebar.addEventListener('click',() => {
  for (const menu of historySidebar.querySelectorAll('details.row-menu[open]')) menu.open = false;
  sidebarCollapsed = true; renderSidebar(); saveSidebar(); expandSidebar.focus();
});
expandSidebar.addEventListener('click',() => { sidebarCollapsed = false; renderSidebar(); saveSidebar(); collapseSidebar.focus(); });
window.addEventListener('keydown',event => {
  if (event.key === 'Escape' && innerWidth <= 640 && !sidebarCollapsed) collapseSidebar.click();
});
sidebarResizer.addEventListener('pointerdown',event => {
  if (event.button !== 0 || innerWidth <= 640) return;
  event.preventDefault(); sidebarResizer.focus();
  sidebarDrag = {id:event.pointerId,x:event.clientX,width:Number(sidebarResizer.getAttribute('aria-valuenow')),saved:sidebarWidth};
  studioShell.setAttribute('data-sidebar-dragging','');
  try { sidebarResizer.setPointerCapture(event.pointerId); } catch {}
});
window.addEventListener('pointermove',event => {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.id) return;
  sidebarWidth = Math.max(240,Math.min(sidebarMaximum(),sidebarDrag.width+event.clientX-sidebarDrag.x)); renderSidebar();
});
function finishSidebarDrag(cancel = false) {
  if (!sidebarDrag) return;
  if (cancel) sidebarWidth = sidebarDrag.saved;
  sidebarDrag = undefined; studioShell.removeAttribute('data-sidebar-dragging'); renderSidebar(); saveSidebar();
}
window.addEventListener('pointerup',event => { if (sidebarDrag?.id === event.pointerId) finishSidebarDrag(); });
window.addEventListener('pointercancel',() => finishSidebarDrag(true));
window.addEventListener('blur',() => finishSidebarDrag(true));
sidebarResizer.addEventListener('lostpointercapture',() => finishSidebarDrag());
sidebarResizer.addEventListener('keydown',event => {
  if (event.key === 'Escape') { finishSidebarDrag(true); return; }
  const width = Number(sidebarResizer.getAttribute('aria-valuenow'));
  const delta = event.shiftKey ? 48 : 16;
  const nextWidth = {ArrowLeft:width-delta,ArrowRight:width+delta,Home:240,End:sidebarMaximum()}[event.key];
  if (nextWidth === undefined) return;
  event.preventDefault(); sidebarWidth = Math.max(240,Math.min(sidebarMaximum(),nextWidth)); renderSidebar(); saveSidebar();
});
sidebarResizer.addEventListener('dblclick',() => { sidebarWidth = 320; renderSidebar(); saveSidebar(); });
window.addEventListener('resize',renderSidebar);
renderSidebar();
`;
