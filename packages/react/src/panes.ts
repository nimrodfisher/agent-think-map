export const PANE_MIN = 180;
export const PANE_MAX = 560;
export const PANE_LEFT_DEFAULT = 280;
export const PANE_RIGHT_DEFAULT = 300;

export function clampPaneWidth(
  width: number,
  min = PANE_MIN,
  max = PANE_MAX,
): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function widthFromDrag(
  edge: "left" | "right",
  startX: number,
  startWidth: number,
  clientX: number,
  min = PANE_MIN,
  max = PANE_MAX,
): number {
  const delta = clientX - startX;
  const next = edge === "left" ? startWidth + delta : startWidth - delta;
  return clampPaneWidth(next, min, max);
}

export function findScrollTarget(root: HTMLElement): HTMLElement {
  let best = root;
  let bestOverflow = root.scrollHeight - root.clientHeight;
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow > bestOverflow) {
      best = el;
      bestOverflow = overflow;
    }
  }
  return best;
}
