import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasFitViewOptions, prefersReducedMotion } from "./reducedMotion.js";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function stubReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("prefersReducedMotion", () => {
  it("is true when matchMedia prefers reduced motion", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when matchMedia does not prefer reduced motion", () => {
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("canvasFitViewOptions", () => {
  it("snaps fitView duration to 0 under reduced motion", () => {
    stubReducedMotion(true);
    expect(canvasFitViewOptions()).toEqual({ padding: 0.18, duration: 0 });
  });

  it("keeps the 280ms fit travel when motion is allowed", () => {
    stubReducedMotion(false);
    expect(canvasFitViewOptions()).toEqual({ padding: 0.18, duration: 280 });
  });
});
