import { describe, expect, it } from "vitest";
import { createTraceStore } from "./store.js";
import { ALL_KIND_FILTER } from "./layout.js";

describe("createTraceStore hover and filter", () => {
  it("starts with no hover and all kinds on", () => {
    const store = createTraceStore();
    expect(store.getState().hoveredNodeId).toBeUndefined();
    expect(store.getState().kindFilter).toEqual(ALL_KIND_FILTER);
  });

  it("hover sets and clears hoveredNodeId without touching selection", () => {
    const store = createTraceStore();
    store.getState().select("tool-1");
    store.getState().hover("skill-1");
    expect(store.getState().hoveredNodeId).toBe("skill-1");
    expect(store.getState().selectedNodeId).toBe("tool-1");
    store.getState().hover(undefined);
    expect(store.getState().hoveredNodeId).toBeUndefined();
  });

  it("reset clears hover and restores kindFilter", () => {
    const store = createTraceStore();
    store.getState().hover("n1");
    store.getState().setKindFilter({ ...ALL_KIND_FILTER, tool: false });
    store.getState().reset();
    expect(store.getState().hoveredNodeId).toBeUndefined();
    expect(store.getState().kindFilter).toEqual(ALL_KIND_FILTER);
  });
});
