import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatPane } from "./ChatPane.js";
import { findScrollTarget } from "./panes.js";

afterEach(() => cleanup());

describe("findScrollTarget", () => {
  it("picks the child that actually overflows", () => {
    const root = document.createElement("div");
    const log = document.createElement("div");
    root.append(log);
    Object.defineProperty(root, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(root, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(log, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 240, configurable: true });
    expect(findScrollTarget(root)).toBe(log);
  });
});

describe("ChatPane", () => {
  it("scrolls the overflowing log to the latest message when Latest is clicked", () => {
    render(
      <ChatPane>
        <div data-testid="log">messages</div>
      </ChatPane>,
    );

    const log = screen.getByTestId("log");
    Object.defineProperty(log, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 240, configurable: true });
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo;

    fireEvent.click(screen.getByRole("button", { name: /latest/i }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
  });
});
