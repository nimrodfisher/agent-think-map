import { createRoot, type Root } from "react-dom/client";
import {
  AgentSimulator,
  type SimulatorLayout,
} from "../../react/src/index.js";
import "../../react/src/styles.css";

export class AgentSimulatorElement extends HTMLElement {
  #root: Root | undefined;
  #mount: HTMLDivElement | undefined;

  static get observedAttributes(): string[] {
    return ["events-url", "layout", "replay"];
  }

  connectedCallback(): void {
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.width = "100%";
    this.style.height = this.getAttribute("height") ?? "100%";
    this.style.minHeight = "0";
    this.#mount = document.createElement("div");
    this.#mount.style.display = "flex";
    this.#mount.style.flexDirection = "column";
    this.#mount.style.flex = "1";
    this.#mount.style.width = "100%";
    this.#mount.style.height = "100%";
    this.#mount.style.minHeight = "0";
    this.append(this.#mount);
    this.#root = createRoot(this.#mount);
    this.#render();
  }

  attributeChangedCallback(): void {
    this.#render();
  }

  disconnectedCallback(): void {
    this.#root?.unmount();
    this.#mount?.remove();
    this.#root = undefined;
    this.#mount = undefined;
  }

  #render(): void {
    if (!this.#root) return;
    const layout = (this.getAttribute("layout") ?? "canvas-only") as SimulatorLayout;
    this.#root.render(
      <AgentSimulator
        eventsUrl={this.getAttribute("events-url") ?? undefined}
        layout={layout}
        replay={this.getAttribute("replay") !== "false"}
      />,
    );
  }
}

export function defineAgentSimulator(tag = "agent-think-map"): void {
  if (!customElements.get(tag)) {
    customElements.define(tag, AgentSimulatorElement);
  }
  registerAlias("agent-think-map", tag);
  registerAlias("agent-simulator", tag);
}

function registerAlias(name: string, primary: string): void {
  if (name === primary || customElements.get(name)) return;
  class AgentThinkMapAlias extends AgentSimulatorElement {}
  customElements.define(name, AgentThinkMapAlias);
}

defineAgentSimulator();
