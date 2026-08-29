import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  exports?: Record<string, string>;
  description?: string;
};
const cli = readFileSync(join(root, "bin", "cli.mjs"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");

describe("codex CLI entry for npx install", () => {
  it("declares vite-node so npx installs the runner the bin spawns", () => {
    expect(pkg.dependencies?.["vite-node"]).toBeDefined();
  });

  it("resolves vite-node via package name so hoisted npx installs work", () => {
    expect(cli).not.toMatch(/node_modules["']?\s*,\s*["']vite-node/);
    expect(cli).toMatch(/import\.meta\.resolve\(\s*["']vite-node\/vite-node\.mjs["']\s*\)/);
  });

  it("dispatches codex and hook-forward", () => {
    expect(cli).toMatch(/arg === "codex"/);
    expect(cli).toMatch(/arg === "hook-forward"/);
    expect(cli).toMatch(/"codex",\s*"src",\s*"cli\.ts"/);
    expect(cli).toMatch(/"codex",\s*"src",\s*"forward-cli\.ts"/);
  });

  it("keeps the stream adapter on agent-think-map/codex", () => {
    expect(pkg.exports?.["./codex"]).toBe("./src/openai.ts");
  });
});

describe("README launch copy", () => {
  it("documents both CLI doors and does not say only Claude Code is one-command", () => {
    expect(readme).toContain("npx agent-think-map claude --install");
    expect(readme).toContain("npx agent-think-map codex --install");
    expect(readme).not.toMatch(/Other CLIs are not one-command yet/);
    expect(readme).not.toMatch(/one-command CLI install is Claude Code today/);
    expect(readme).toMatch(/NanoClaw/);
    expect(readme).toMatch(/TraceAdapter/);
    expect(pkg.description).toMatch(/Codex/i);
  });
});
