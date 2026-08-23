import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function workspaceDirs(root: string, parent: string): string[] {
  const dir = join(root, parent);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "package.json")))
    .map((entry) => `${parent}/${entry.name}`);
}

describe("package-lock workspaces", () => {
  it("lists every workspace package so npm ci stays in sync", () => {
    const root = process.cwd();
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
      packages: Record<string, unknown>;
    };
    const workspaces = ["packages", "packages/adapters", "apps"].flatMap((parent) =>
      workspaceDirs(root, parent),
    );
    expect(workspaces.length).toBeGreaterThan(0);
    expect(workspaces.filter((workspace) => !(workspace in lock.packages))).toEqual([]);
  });
});
