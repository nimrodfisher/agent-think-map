import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createClaudeCodeStudio } from "../claude-code/src/studio.js";
import { createCodexStudio } from "../codex/src/studio.js";
import { backups } from "./config.js";

for (const adapter of ["claude", "codex"] as const) {
  it(`${adapter} public CLI installs, diagnoses and rolls back in isolated HOME/CWD`, async () => {
    const home = mkdtempSync(join(tmpdir(), "atm-cli-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "atm-cli-project-"));
    const server = adapter === "claude" ? createClaudeCodeStudio({ dbPath: ":memory:", root: resolve(".") }) : createCodexStudio({ dbPath: ":memory:", root: resolve(".") });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const run = (...flags: string[]) => new Promise<string>((resolveRun, reject) => {
      execFile(process.execPath, [resolve("bin/cli.mjs"), adapter, "--port", String(port), "--no-open", ...flags], { cwd, windowsHide: true, timeout: 20000, env: { ...process.env, HOME: home, USERPROFILE: home } }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolveRun(stdout));
    });
    try {
      const file = adapter === "claude" ? join(cwd, ".claude", "settings.local.json") : join(home, ".codex", "hooks.json");
      mkdirSync(join(file, ".."), { recursive: true });
      const original = '{ "theme": "light", "hooks": {} }\n';
      writeFileSync(file, original);
      expect(await run("--install")).toContain("Wrote");
      const backup = backups(file)[0];
      expect(readFileSync(backup, "utf8")).toBe(original);
      expect(await run("--doctor")).toContain("Doctor OK: observed synthetic event doctor-");
      const altered = JSON.parse(readFileSync(file, "utf8")); altered.theme = "dark";
      writeFileSync(file, JSON.stringify(altered));
      expect(await run("--rollback", backup)).toContain("Restored hooks");
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ theme: "dark", hooks: {} });
      await expect(run("--doctor")).rejects.toThrow(/--install/);
    } finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(home, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true });
    }
  }, 60000);
}
