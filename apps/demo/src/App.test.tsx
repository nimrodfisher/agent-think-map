import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App, { replayIntervalMs } from "./App.js";

// Test the real simulator playback, selection bridge, inspector and timeline;
// graph geometry is covered in the production-browser smoke.
vi.mock("../../../packages/react/src/TraceCanvas.js", () => ({ TraceCanvas: () => <div /> }));

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const play = (count: number) => act(() => { vi.advanceTimersByTime(count * replayIntervalMs); });
const inspector = () => document.querySelector(".atc-inspector")!;
const steps = () => document.querySelectorAll(".atc-timeline button");

describe("demo investigation", () => {
  it("waits for evidence when the running Read was already selected manually", () => {
    render(<App />);
    play(2);
    fireEvent.click(screen.getByRole("button", { name: /^Read configuration,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect the failed step" }));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    play(2);
    expect(inspector().textContent).toContain("EACCES");
    expect(document.activeElement).toBe(inspector());
  });

  it("honors an early inspect request when the step arrives, then permits manual and repeated selection", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect the failed step" }));
    expect(inspector().textContent).not.toContain("Read configuration");
    play(3);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    play(5);
    expect(inspector().textContent).toContain("./config/app.json");
    expect(inspector().textContent).toContain("EACCES");
    expect(document.activeElement).toBe(inspector());
    expect(steps()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Answer \(unverified\),/ }));
    expect(inspector().textContent).toContain("remains unverified");
    expect(inspector().textContent).not.toContain("EACCES");
    fireEvent.click(screen.getByRole("button", { name: "Inspect the failed step" }));
    expect(inspector().textContent).toContain("EACCES");
  });

  it("resets playback and selection on replay and switches without stale failure events", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect the failed step" }));
    play(8);
    fireEvent.click(screen.getByRole("button", { name: "Replay sample" }));
    expect(steps()).toHaveLength(0);
    expect(inspector().textContent).not.toContain("EACCES");
    play(8);
    expect(steps()).toHaveLength(3);
    expect(inspector().textContent).not.toContain("EACCES");
    fireEvent.change(screen.getByLabelText("Sample"), { target: { value: "github" } });
    expect(steps()).toHaveLength(0);
    play(18);
    expect(steps()).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: /^Read,/ }));
    expect(inspector().textContent).toContain("src/Login.tsx");
    expect(inspector().textContent).not.toContain("EACCES");
    fireEvent.click(screen.getByRole("button", { name: "Replay sample" }));
    play(18);
    expect(steps()).toHaveLength(6);
    expect(inspector().textContent).not.toContain("src/Login.tsx");
  });

  it("cancels a pending inspection when switching during replay", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect the failed step" }));
    play(1);
    fireEvent.change(screen.getByLabelText("Sample"), { target: { value: "github" } });
    play(20);
    expect(steps()).toHaveLength(6);
    expect(inspector().textContent).not.toContain("EACCES");
    fireEvent.change(screen.getByLabelText("Sample"), { target: { value: "failure" } });
    play(8);
    expect(steps()).toHaveLength(3);
    expect(inspector().textContent).not.toContain("EACCES");
  });
});
