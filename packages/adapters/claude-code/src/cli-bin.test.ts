import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
const cli = readFileSync(join(root, "bin", "cli.mjs"), "utf8");

describe("claude CLI entry for npx install", () => {
  it("declares vite-node so npx installs the runner the bin spawns", () => {
    expect(pkg.dependencies?.["vite-node"]).toBeDefined();
  });

  it("resolves vite-node via package name so hoisted npx installs work", () => {
    expect(cli).not.toMatch(/node_modules["']?\s*,\s*["']vite-node/);
    expect(cli).toMatch(/import\.meta\.resolve\(\s*["']vite-node\/vite-node\.mjs["']\s*\)/);
  });
});
