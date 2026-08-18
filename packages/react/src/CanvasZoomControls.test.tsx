import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CanvasZoomControls } from "./CanvasZoomControls.js";

afterEach(() => cleanup());

describe("CanvasZoomControls", () => {
  it("calls zoom in and zoom out from the canvas buttons", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    render(<CanvasZoomControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} />);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
  });
});
