import { afterEach, describe, expect, it, vi } from "vitest";

describe("custom element tags", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("registers agent-think-map as the public tag and agent-simulator as an alias", async () => {
    await import("./index.js");
    expect(customElements.get("agent-think-map")).toBeDefined();
    expect(customElements.get("agent-simulator")).toBeDefined();
  });
});
