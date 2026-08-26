import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CanvasZoomControls } from "./CanvasZoomControls.js";

afterEach(() => cleanup());

describe("CanvasZoomControls", () => {
  it("calls zoom in and zoom out from the canvas buttons", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onFit = vi.fn();
    render(<CanvasZoomControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFit={onFit} />);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it("calls fit from the canvas buttons", () => {
    const onFit = vi.fn();
    render(<CanvasZoomControls onZoomIn={() => {}} onZoomOut={() => {}} onFit={onFit} />);
    fireEvent.click(screen.getByRole("button", { name: "Fit to view" }));
    expect(onFit).toHaveBeenCalledOnce();
  });
});
