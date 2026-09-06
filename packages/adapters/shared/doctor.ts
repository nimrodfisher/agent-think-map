import { exec } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseConfig, readConfig } from "./config.js";

export async function doctor(file: string, origin: string, adapter: "claude" | "codex", timeout = 10000): Promise<string> {
  const studio = new URL(origin);
  if (studio.protocol !== "http:" || studio.hostname !== "127.0.0.1") throw new Error("Doctor requires a local Studio at http://127.0.0.1:<port>.");
  const groups = parseConfig(readConfig(file)).hooks?.UserPromptSubmit;
  const handlers = Array.isArray(groups) ? groups.flatMap(group => Array.isArray(group?.hooks) ? group.hooks : []) : [];
  const hook = handlers.find(hook => adapter === "claude"
    ? hook.type === "http" && typeof hook.url === "string" && hook.url.startsWith(`${origin}/hook?`)
    : hook.type === "command" && typeof hook.command === "string" && hook.command.includes("hook-forward") && hook.command.includes(`${origin}/hook?`));
  if (!hook) throw new Error(`No installed ${adapter} hook for ${origin} in ${file}. Run --install with the same --port and scope first.`);
  const id = `doctor-${randomUUID()}`;
  const prompt = `Agent Think Map doctor ${id}`;
  const body = JSON.stringify({ session_id: id, hook_event_name: "UserPromptSubmit", prompt });
  try {
    if (adapter === "claude") {
      const response = await fetch(hook.url, { method: "POST", headers: { ...hook.headers, "content-type": "application/json" }, body, signal: AbortSignal.timeout(timeout) });
      if (!response.ok) throw new Error(`Hook returned HTTP ${response.status}`);
    } else {
      // Simulate an opted-in synthetic session through the exact installed command.
      // Never enable collection or write consent in the user's real home.
      const home = mkdtempSync(join(tmpdir(), "atm-doctor-"));
      try {
        mkdirSync(join(home, ".agent-think-map"));
        writeFileSync(join(home, ".agent-think-map", "codex-consent.json"), JSON.stringify({ consent: "enabled" }));
        await new Promise<void>((resolve, reject) => {
          const child = exec(hook.command, { cwd: home, windowsHide: true, timeout, env: { ...process.env, HOME: home, USERPROFILE: home } }, error => error ? reject(new Error("Installed hook command failed or timed out. Check its Node and CLI paths.")) : resolve());
          child.stdin?.on("error", () => {});
          child.stdin?.end(body);
        });
      } finally { rmSync(home, { recursive: true, force: true }); }
    }
    const deadline = Date.now() + timeout;
    do {
      const response = await fetch(`${origin}/sessions`, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      if (!response.ok) throw new Error(`Studio returned HTTP ${response.status}`);
      const sessions = await response.json();
      if (Array.isArray(sessions) && sessions.some(session => session.id === id && session.prompt === prompt && session.eventCount > 0)) return id;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw new Error("Synthetic event was not observed");
  } catch (error) {
    throw new Error(`Doctor failed: ${error instanceof Error ? error.message : "hook unavailable"}. Start Studio, reinstall hooks after a restart (tokens rotate), and check --port and scope.`, { cause: error });
  }
}
