import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { githubIssueFixture, reduceTraceAll } from "@agent-think-map/core";
import { AgentSimulator } from "./AgentSimulator.js";
import { TraceStoreProvider, createTraceStore } from "./store.js";
import { TraceCanvas } from "./TraceCanvas.js";

const canvasSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TraceCanvas.tsx"), "utf8");

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

describe("TraceCanvas hover", () => {
  it("records hoveredNodeId when a node is entered and clears on leave", async () => {
    const state = reduceTraceAll(githubIssueFixture);
    const store = createTraceStore(state);
    render(
      <TraceStoreProvider value={store}>
        <div style={{ width: 800, height: 600 }}>
          <TraceCanvas />
        </div>
      </TraceStoreProvider>,
    );
    const skill = state.nodes.find((node) => node.kind === "skill");
    expect(skill).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector(`.atc-node--skill`)).toBeTruthy();
    });
    const article = document.querySelector(`.atc-node--skill`);
    expect(article).toBeTruthy();
    fireEvent.mouseEnter(article!);
    expect(store.getState().hoveredNodeId).toBe(skill!.id);
    await waitFor(() => {
      expect(document.querySelector(".atc-node--skill")?.className).toContain("is-hovered");
    });
    fireEvent.mouseLeave(article!);
    expect(store.getState().hoveredNodeId).toBeUndefined();
  });
});

describe("TraceCanvas kind chips", () => {
  it("toggles Tools off without removing the tool node from the document", async () => {
    render(<AgentSimulator events={githubIssueFixture} replay={false} />);
    const tools = screen.getByRole("button", { name: /Tools/ });
    expect(tools.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(document.querySelector(".atc-node--tool")).toBeTruthy();
    });
    fireEvent.click(tools);
    expect(tools.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".atc-node--tool")).toBeTruthy();
    await waitFor(() => {
      const tool = document.querySelector(".atc-node--tool");
      expect(tool?.closest(".react-flow__node")?.className).toContain("is-filtered-out");
      expect(tool?.className).not.toContain("is-filtered-out");
    });
  });

  it("shows a count on each kind chip", () => {
    render(<AgentSimulator events={githubIssueFixture} replay={false} />);
    expect(screen.getByRole("button", { name: /Tools/ }).textContent).toMatch(/\d/);
  });
});

describe("TraceCanvas reduced motion fit", () => {
  it("resolves fitView duration inside callbacks, not during render", () => {
    const effect = canvasSource.slice(
      canvasSource.indexOf("useEffect"),
      canvasSource.indexOf("}, [topologyKey, fitView]"),
    );
    expect(effect).toContain("canvasFitViewOptions()");
    expect(effect).not.toMatch(/duration:\s*280/);
    expect(canvasSource).toMatch(/onFit=\{\(\) => \{[\s\S]*canvasFitViewOptions\(\)/);
    expect(canvasSource).not.toMatch(/const reduce\s*=/);
  });
});
