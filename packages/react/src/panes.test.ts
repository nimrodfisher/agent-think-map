import { describe, expect, it } from "vitest";
import { clampPaneWidth, widthFromDrag } from "./panes.js";

describe("clampPaneWidth", () => {
  it("keeps a width inside the min and max", () => {
    expect(clampPaneWidth(240)).toBe(240);
  });

  it("does not shrink a pane below the minimum", () => {
    expect(clampPaneWidth(40)).toBe(180);
  });

  it("does not grow a pane past the maximum", () => {
    expect(clampPaneWidth(900)).toBe(560);
  });
});

describe("widthFromDrag", () => {
  it("grows the left pane when the handle moves right", () => {
    expect(widthFromDrag("left", 200, 280, 240)).toBe(320);
  });

  it("shrinks the right pane when the handle moves right", () => {
    expect(widthFromDrag("right", 800, 300, 840)).toBe(260);
  });
});
