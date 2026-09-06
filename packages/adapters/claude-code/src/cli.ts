import { rollbackConfig } from "../../shared/config.js";
import { doctor } from "../../shared/doctor.js";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn } from "node:child_process";
import { ClaudeCodeTraceHub, claudeCodeHookSettings } from "./hub.js";
import { hasClaudeCodeHooks, installClaudeCodeHooks } from "./install.js";
import { createClaudeCodeStudio } from "./studio.js";
import { SqliteRunStore } from "../../../core/src/sqlite-run-store.js";
import { importLocalHistory } from "../../../core/src/history-import.js";
import { ClaudeCodeHistoryImporter, defaultClaudeHistoryRoot } from "./import-history.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const HELP = `
agent-think-map claude — live think-map for Claude Code CLI

  1. Keep this process running. A browser tab opens the session studio.
  2. In the project where you run \`claude\`, install hooks (this folder):

       npx agent-think-map claude --install

  3. In another terminal, in that same folder, run \`claude\` and ask it
     to use a tool (e.g. "Read README.md"). The graph builds in the browser.

  Maintenance: --doctor   --rollback [full-backup-path] (latest valid by default)
  Startup refreshes existing hooks in this project. After restarting Studio,
  restart Claude Code to load the new token. Other projects need --install again.
  Flags: --port 3334   --install   --print-hooks   --smoke   --no-open

  Import existing local sessions without hooks:
    npx agent-think-map claude --import-history [--history-root <path>] [--dry-run]
  Live-captured sessions are skipped. Dry-run simulates without writing history.
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
    portFlag >= 0 ? Number(argv[portFlag + 1]) : Number(process.env.PORT) || 3334;
  return {
    install: flags.has("--install"),
    printHooks: flags.has("--print-hooks"),
    smoke: flags.has("--smoke"),
    open: !flags.has("--no-open"),
    port: Number.isFinite(port) ? port : 3334,
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

const SMOKE = [
  {
    session_id: "smoke",
    hook_event_name: "UserPromptSubmit",
    prompt: "Read README.md and summarize it",
  },
  {
    session_id: "smoke",
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_use_id: "toolu_smoke",
    tool_input: { file_path: "README.md" },
  },
  {
    session_id: "smoke",
    hook_event_name: "PostToolUse",
    tool_use_id: "toolu_smoke",
    tool_response: "agent-think-map — see the agent think",
  },
  {
    session_id: "smoke",
    hook_event_name: "Stop",
    last_assistant_message: "It is an embeddable think-map for agent traces.",
  },
];

function studioArgv(argv: string[]): string[] {
  const start = argv.findIndex((arg) => arg.startsWith("--"));
  return start === -1 ? [] : argv.slice(start);
}

export async function startClaudeCodeStudio(argv = studioArgv(process.argv)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  if (argv.includes("--import-history")) {
    if (["--install","--print-hooks","--smoke","--doctor","--rollback"].some(flag => argv.includes(flag))) {
      throw new Error("--import-history cannot be combined with hook or Studio maintenance actions");
    }
    const index = argv.indexOf("--history-root");
    const historyRoot = index < 0 ? defaultClaudeHistoryRoot() : argv[index + 1];
    if (!historyRoot || historyRoot.startsWith("--")) throw new Error("--history-root requires a path");
    const dryRun = argv.includes("--dry-run");
    const store = dryRun ? SqliteRunStore.importPreview() : new SqliteRunStore();
    try {
      const report = await importLocalHistory(store, new ClaudeCodeHistoryImporter(), { root: historyRoot });
      console.log(dryRun ? "History import dry-run (no history written)" : "History import complete");
      console.log(JSON.stringify(report, null, 2));
    } finally { await store.close(); }
    return;
  }
  if (argv.includes("--history-root") || argv.includes("--dry-run")) throw new Error("--history-root and --dry-run require --import-history");
  const args = parseArgs(argv);
  const host = "127.0.0.1";
  const origin = `http://${host}:${args.port}`;
  const configFile = join(process.env.ATM_CWD || process.cwd(), ".claude", "settings.local.json");
  if (argv.includes("--rollback")) {
    const value = argv[argv.indexOf("--rollback") + 1];
    const backup = rollbackConfig(configFile, value && !value.startsWith("--") ? value : undefined);
    console.log(`Restored hooks from ${backup}. Unrelated user edits were preserved.`);
    return;
  }
  if (argv.includes("--doctor")) {
    const id = await doctor(configFile, origin, "claude");
    console.log(`Doctor OK: observed synthetic event ${id} at ${origin}.`);
    return;
  }
  async function activeHookUrl(): Promise<string> {
    const response = await fetch(`${origin}/hooks.json`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("Could not read running Studio hook configuration");
    const settings = await response.json();
    const hook = settings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0];
    const value = hook?.url;
    if (typeof value !== "string") throw new Error("Running Studio has no hook endpoint");
    const endpoint = new URL(value);
    if (endpoint.origin !== origin || endpoint.pathname !== "/hook" || !endpoint.searchParams.get("token")) {
      throw new Error("Running Studio needs the localhost security update; restart it first");
    }
    return value;
  }

  if (args.printHooks) {
    const hookUrl = await activeHookUrl();
    console.log(JSON.stringify(claudeCodeHookSettings(hookUrl), null, 2));
    return;
  }

  await ensureCdn();

  const installDir = process.env.ATM_CWD || process.cwd();
  const refreshHooks = args.install || hasClaudeCodeHooks(installDir, origin);
  async function installHooks() {
    const hookUrl = await activeHookUrl();
    const file = installClaudeCodeHooks(installDir, hookUrl);
    console.log(`Wrote Claude Code hooks → ${file}`);
    console.log("Run `claude` in that project. Restart Claude Code if it is already open.\n");
  }

  const hub = new ClaudeCodeTraceHub({ recover: false });

  const server = createClaudeCodeStudio({ hub, root, origin });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(args.port, host, resolve);
    });
  } catch (error) {
    await hub.close();
    const busy =
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EADDRINUSE";
    if (busy) {
      console.log(`Port ${args.port} is already in use. Studio is probably already at ${origin}`);
      console.log(`Open ${origin} — do not start a second server.`);
      if (refreshHooks) {
        await installHooks();
        return;
      }
    }
    throw error;
  }

  await hub.recover();
  if (args.smoke) {
    for (const hook of SMOKE) await hub.ingest(hook);
  }

  const shutdown = () => { server.close(); server.closeAllConnections(); void hub.close().then(() => process.exit(0)); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  if (refreshHooks) await installHooks();

  console.log(HELP);
  console.log(`Studio → ${origin}`);
  console.log(`Hooks  → POST ${origin}/hook (token required)\n`);
  if (!refreshHooks) {
    console.log("To attach the current folder's Claude Code CLI:\n");
    console.log(`  npx agent-think-map claude --install --port ${args.port}\n`);
  }
  if (args.open) openBrowser(origin);
}

startClaudeCodeStudio().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
