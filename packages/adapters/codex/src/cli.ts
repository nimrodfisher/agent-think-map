import { rollbackConfig } from "../../shared/config.js";
import { doctor } from "../../shared/doctor.js";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn } from "node:child_process";
import { CodexTraceHub, codexHookSettings, hookForwardCommand } from "./hub.js";
import { codexProjectRoot, installCodexHooks } from "./install.js";
import { resetCodexConsent } from "./consent.js";
import { createCodexStudio } from "./studio.js";
import { SMOKE } from "./smoke.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const HELP = `
agent-think-map codex — live think-map for Codex

  1. Keep this process running. A browser tab opens the session studio.
  2. Install once for your Codex account. This covers future Codex projects and sessions:

       npx agent-think-map codex --install

  3. On the first session, Codex asks whether to enable Agent Think Map. Reply yes, no, or later.
  4. If you choose yes, the graph builds in the browser as Codex uses tools and subagents.

  Codex hooks do not stream chain-of-thought. The map is prompt → tools / MCP → answer.
  For reasoning items, ingest app-server notifications via TraceAdapter / agent-think-map/codex.

  Maintenance: --doctor   --rollback [full-backup-path] (latest valid by default)
  Flags: --port 3335   --install   --project   --print-hooks   --smoke   --no-open
  --smoke loads a fake demo session. Omit it when mapping a live Codex run.
`;

function openBrowser(url: string) {
  const cmd =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const portFlag = argv.findIndex((arg) => arg === "--port");
  const port =
    portFlag >= 0 ? Number(argv[portFlag + 1]) : Number(process.env.PORT) || 3335;
  return {
    install: flags.has("--install"),
    project: flags.has("--project"),
    printHooks: flags.has("--print-hooks"),
    smoke: flags.has("--smoke"),
    open: !flags.has("--no-open"),
    port: Number.isFinite(port) ? port : 3335,
  };
}

async function ensureCdn(): Promise<void> {
  const cdnJs = join(root, "dist", "element.cdn.js");
  if (existsSync(cdnJs)) return;
  console.log("Building the canvas bundle (npm run build:cdn)...\n");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", "build:cdn"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("build:cdn failed")),
    );
  });
}

function studioArgv(argv: string[]): string[] {
  const start = argv.findIndex((arg) => arg.startsWith("--"));
  return start === -1 ? [] : argv.slice(start);
}

export async function startCodexStudio(argv = studioArgv(process.argv)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const args = parseArgs(argv);
  const host = "127.0.0.1";
  const origin = `http://${host}:${args.port}`;
  const configFile = join(args.project ? join(codexProjectRoot(process.env.ATM_CWD || process.cwd()), ".codex") : join(homedir(), ".codex"), "hooks.json");
  if (argv.includes("--rollback")) {
    const value = argv[argv.indexOf("--rollback") + 1];
    const backup = rollbackConfig(configFile, value && !value.startsWith("--") ? value : undefined);
    console.log(`Restored hooks from ${backup}. Unrelated user edits were preserved.`);
    return;
  }
  if (argv.includes("--doctor")) {
    const id = await doctor(configFile, origin, "codex");
    console.log(`Doctor OK: observed synthetic event ${id} at ${origin}.`);
    return;
  }
  async function activeHookUrl(): Promise<string> {
    const response = await fetch(`${origin}/hooks.json`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("Could not read running Studio hook configuration");
    const settings = await response.json();
    const hook = settings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0];
    const value = hook?.command?.match(/--url (\S+)/)?.[1];
    if (typeof value !== "string") throw new Error("Running Studio has no hook endpoint");
    const endpoint = new URL(value);
    if (endpoint.origin !== origin || endpoint.pathname !== "/hook" || !endpoint.searchParams.get("token")) {
      throw new Error("Running Studio needs the localhost security update; restart it first");
    }
    return value;
  }
  const cliJs = join(root, "bin", "cli.mjs");

  if (args.printHooks) {
    const hookUrl = await activeHookUrl();
    console.log(JSON.stringify(codexHookSettings(hookForwardCommand(hookUrl, cliJs)), null, 2));
    return;
  }

  await ensureCdn();

  async function installHooks() {
    const hookUrl = await activeHookUrl();
    const installDir = codexProjectRoot(process.env.ATM_CWD || process.cwd());
    const scope = args.project ? "project" : "user";
    const file = installCodexHooks(installDir, hookUrl, cliJs, scope);
    if (scope === "user") resetCodexConsent();
    console.log(`Wrote Codex hooks → ${file}`);
    console.log(
      scope === "user"
        ? "Restart Codex and trust the new hook-forward command when prompted. The first session will ask for consent.\n"
        : "Restart Codex in that project and trust the new hook-forward command when prompted.\n",
    );
  }

  const hub = new CodexTraceHub();
  if (args.smoke) {
    console.log("Demo session `smoke` loaded. Omit --smoke to follow a live Codex run.\n");
    for (const hook of SMOKE) hub.ingest(hook);
  }

  const server = createCodexStudio({ hub, root, origin });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(args.port, host, resolve);
    });
  } catch (error) {
    const busy =
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EADDRINUSE";
    if (busy) {
      console.log(`Port ${args.port} is already in use. Studio is probably already at ${origin}`);
      console.log(`Open ${origin} — do not start a second server.`);
      console.log("If the tab still shows ?session=smoke, stop that old process and restart without --smoke.");
      if (args.install) {
        await installHooks();
        return;
      }
    }
    throw error;
  }

  if (args.install) await installHooks();

  console.log(HELP);
  console.log(`Studio → ${origin}`);
  console.log(`Hooks  → POST ${origin}/hook (token required)\n`);
  if (!args.install) {
    console.log("To install the user-level Codex hooks:\n");
    console.log(`  npx agent-think-map codex --install --port ${args.port}\n`);
  }
  if (args.open) openBrowser(origin);
}

startCodexStudio().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
