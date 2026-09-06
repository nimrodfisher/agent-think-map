import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SqliteRunStore } from "../../../core/src/sqlite-run-store.js";

it("imports through the public CLI, repeats idempotently, and dry-runs without touching disk history or hooks", async () => {
  const home = mkdtempSync(join(tmpdir(), "atm-import-cli-"));
  const root = join(home, "history"), id = "33333333-3333-4333-8333-333333333333";
  mkdirSync(root);
  writeFileSync(join(root, id + ".jsonl"), JSON.stringify({ type: "user", uuid: "prompt", sessionId: id, timestamp: "2026-09-01T10:00:00Z", message: { content: "Old session" } }) + "\n");
  const run = (...flags: string[]) => new Promise<string>((resolveRun, reject) => {
    execFile(process.execPath, [resolve("bin/cli.mjs"), "claude", "--import-history", "--history-root", root, ...flags],
      { cwd: home, windowsHide: true, timeout: 20000, env: { ...process.env, HOME: home, USERPROFILE: home } },
      (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolveRun(stdout));
  });
  const report = (output: string) => JSON.parse(output.slice(output.indexOf("{")));
  try {
    const before = readdirSync(home);
    expect(report(await run("--dry-run"))).toMatchObject({ runsCreated: 1, eventsAppended: 1 });
    expect(readdirSync(home)).toEqual(before);
    const imported = report(await run());
    expect(imported).toMatchObject({ runsCreated: 1, eventsAppended: 1, filesSkipped: 0 });
    const file = join(home, ".agent-think-map", "runs.db");
    const bytes = readFileSync(file), files = readdirSync(join(home, ".agent-think-map"));
    expect(report(await run("--dry-run"))).toMatchObject({ runsCreated: 0, eventsAppended: 0, eventsAlreadyPresent: 1 });
    expect(readFileSync(file)).toEqual(bytes);
    expect(readdirSync(join(home, ".agent-think-map"))).toEqual(files);
    expect(report(await run())).toMatchObject({ runsCreated: 0, eventsAppended: 0, eventsAlreadyPresent: 1 });
    expect(existsSync(join(home, ".claude"))).toBe(false);
    const store = new SqliteRunStore({ path: file });
    try { expect(await store.getRun(id)).toMatchObject({ origin: "imported", status: "interrupted" }); }
    finally { await store.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
}, 60000);
