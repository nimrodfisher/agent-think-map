import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createClaudeCodeStudio } from "../claude-code/src/studio.js";
import { createCodexStudio } from "../codex/src/studio.js";
import { installClaudeCodeHooks } from "../claude-code/src/install.js";
import { installCodexHooks } from "../codex/src/install.js";
import { doctor } from "./doctor.js";
const servers: Server[] = []; const dirs: string[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
function temp() { const dir = mkdtempSync(join(tmpdir(), "atm-doctor-test-")); dirs.push(dir); return dir; }
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
for (const adapter of ["claude", "codex"] as const) {
  it(`${adapter} doctor observes a synthetic event through the installed path in a real Studio`, async () => {
    const origin = await listen(adapter === "claude" ? createClaudeCodeStudio({ root: resolve(".") }) : createCodexStudio({ root: resolve(".") }));
    const settings = await (await fetch(`${origin}/hooks.json`)).json();
    const hook = settings.hooks.UserPromptSubmit[0].hooks[0];
    const url = adapter === "claude" ? hook.url : hook.command.match(/--url (\S+)/)[1];
    const file = adapter === "claude" ? installClaudeCodeHooks(temp(), url) : installCodexHooks(temp(), url, resolve("bin/cli.mjs"), "user", temp());
    const id = await doctor(file, origin, adapter);
    const sessions = await (await fetch(`${origin}/sessions`)).json();
    expect(sessions.find((session: any) => session.id === id).eventCount).toBeGreaterThan(0);
    // A forwarder's zero exit status must not mask token rotation / rejected POSTs.
    writeFileSync(file, readFileSync(file, "utf8").replace(/token=[a-f0-9]+/g, "token=stale"));
    await expect(doctor(file, origin, adapter, 1500)).rejects.toThrow(/reinstall hooks/);
  }, 20000);
}
it("does not accept HTTP success as proof that its event arrived", async () => {
  const origin = await listen(createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(req.url === "/sessions" ? "[]" : "{}"); }));
  const file = installClaudeCodeHooks(temp(), `${origin}/hook?token=test`);
  await expect(doctor(file, origin, "claude", 200)).rejects.toThrow(/not observed/);
});
it("gives actionable instructions when no hook is installed", async () => {
  await expect(doctor(join(temp(), "absent.json"), "http://127.0.0.1:3334", "claude")).rejects.toThrow(/--install/);
});
