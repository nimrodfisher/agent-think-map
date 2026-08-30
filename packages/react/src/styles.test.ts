import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "styles.css"), "utf8");

function mediaBlocks(query: string): string[] {
  const needle = `@media ${query}`;
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(needle, from);
    if (start < 0) break;
    const open = css.indexOf("{", start);
    if (open < 0) break;
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          blocks.push(css.slice(open + 1, i));
          from = i + 1;
          break;
        }
      }
    }
  }
  return blocks;
}

function hoverMediaCss(): string {
  return mediaBlocks("(hover: hover)").join("\n");
}

describe("styles a11y and motion audit", () => {
  it("nests every :hover rule in hover:hover", () => {
    const covered = hoverMediaCss();
    const hovers = [...css.matchAll(/[^{}]+?:hover[^{]*\{/g)].map((match) => match[0].trim());
    expect(hovers.length).toBeGreaterThan(0);
    for (const rule of hovers) {
      expect(covered, `${rule} must live in @media (hover: hover)`).toContain(rule);
    }
  });

  it("press scale is only on chips and zoom, not nodes", () => {
    expect(css).toMatch(/\.atc-kind-chip:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    expect(css).toMatch(/\.atc-zoom button:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    expect(css).not.toMatch(/\.atc-node[^{]*:active[^{]*\{[^}]*scale\(/);
  });

  it("lifts hovered nodes with translate, not transform", () => {
    const hoverCss = hoverMediaCss();
    expect(hoverCss).toMatch(/\.atc-node\.is-hovered[^{]*\{[^}]*translate:\s*0 -2px/);
    expect(hoverCss).not.toMatch(/\.atc-node\.is-hovered[^{]*\{[^}]*transform:/);
    expect(hoverCss).not.toMatch(/\.atc-node\.is-hovered[^{]*\{[^}]*scale\(/);
    expect(css).toMatch(/\.atc-node\s*\{[^}]*transition:[^}]*translate 180ms ease/);
    expect(css).not.toMatch(/\.atc-node\s*\{[^}]*transition:[^}]*transform 180ms/);
  });

  it("uses ink focus-visible rings on chips, zoom, and canvas nodes without outline none", () => {
    expect(css).toMatch(
      /\.atc-kind-chip:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--atc-ink\)/,
    );
    expect(css).toMatch(
      /\.atc-zoom button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--atc-ink\)/,
    );
    expect(css).toMatch(
      /\.react-flow__node\.selectable:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--atc-ink\)/,
    );
    const chipFocus = css.match(/\.atc-kind-chip:focus-visible\s*\{[^}]+\}/)?.[0] ?? "";
    const zoomFocus = css.match(/\.atc-zoom button:focus-visible\s*\{[^}]+\}/)?.[0] ?? "";
    const nodeFocus =
      css.match(/\.react-flow__node\.selectable:focus-visible\s*\{[^}]+\}/)?.[0] ?? "";
    expect(chipFocus).not.toMatch(/outline:\s*none/);
    expect(zoomFocus).not.toMatch(/outline:\s*none/);
    expect(nodeFocus).not.toMatch(/outline:\s*none/);
    expect(nodeFocus).toMatch(/outline-offset:\s*2px/);
  });

  it("places Fit beside zoom in a horizontal cluster", () => {
    expect(css).toMatch(/\.atc-zoom\s*\{[^}]*flex-direction:\s*row/);
    expect(css).toMatch(/\.atc-zoom button\s*\{[^}]*border-right:\s*1px solid var\(--atc-rule\)/);
    expect(css).toMatch(/\.atc-zoom-fit\s*\{[^}]*font-size:\s*0\.68rem/);
  });

  it("snaps transitions and beam travel under reduced motion", () => {
    const reduce = mediaBlocks("(prefers-reduced-motion: reduce)").join("\n");
    expect(reduce).toMatch(/transition-duration:\s*0ms/);
    expect(reduce).toMatch(/\.react-flow__edge-path\.atc-edge-beam/);
    expect(reduce).toMatch(/animation:\s*none/);
  });
});
