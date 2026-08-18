import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SplitStage } from "./SplitStage.js";

afterEach(() => cleanup());

describe("SplitStage", () => {
  it("exposes draggable separators for the left and right sidebars", () => {
    render(
      <SplitStage
        chat={<div>chat</div>}
        canvas={<div>canvas</div>}
        inspector={<div>inspector</div>}
      />,
    );

    expect(screen.getByRole("separator", { name: "Resize chat sidebar" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize inspector sidebar" })).toBeTruthy();
  });

  it("widens the chat sidebar when the left handle is dragged right", () => {
    const { container } = render(
      <SplitStage
        chat={<div>chat</div>}
        canvas={<div>canvas</div>}
        inspector={<div>inspector</div>}
      />,
    );

    const handle = screen.getByRole("separator", { name: "Resize chat sidebar" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });

    expect(container.firstElementChild?.getAttribute("style")).toContain("296px");
  });
});
