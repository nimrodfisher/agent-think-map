export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

export function canvasFitViewOptions(): { padding: number; duration: number } {
  return { padding: 0.18, duration: prefersReducedMotion() ? 0 : 280 };
}
