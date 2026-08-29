import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn } from "node:child_process";
import { CodexTraceHub, codexHookSettings, hookForwardCommand } from "./hub.js";
import { installCodexHooks } from "./install.js";
import { createCodexStudio } from "./studio.js";
import { SMOKE } from "./smoke.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const HELP = `
agent-think-map codex — live think-map for Codex CLI

  1. Keep this process running. A browser tab opens the session studio.
  2. In the project where you run \`codex\`, install hooks (this folder):

       npx agent-think-map codex --install

  3. In Codex, open /hooks and trust the agent-think-map command.
  4. Ask Codex to use a tool (e.g. read README.md). The graph builds in the browser.

  Codex CLI hooks do not stream chain-of-thought. The map is prompt → tools / MCP → answer.
  For reasoning items, ingest app-server notifications via TraceAdapter / agent-think-map/codex.

  Flags: --port 3335   --install   --print-hooks   --smoke   --no-open
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
  const hookUrl = `${origin}/hook`;

  if (args.printHooks) {
    console.log(JSON.stringify(codexHookSettings(hookForwardCommand(hookUrl)), null, 2));
    return;
  }

  await ensureCdn();

  const installDir = process.env.ATM_CWD || process.cwd();
  if (args.install) {
    const file = installCodexHooks(installDir, hookUrl);
    console.log(`Wrote Codex hooks → ${file}`);
    console.log("Run `codex` in that project. Trust the hooks in /hooks.\n");
  }

  const hub = new CodexTraceHub();
  if (args.smoke) {
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
      if (args.install) return;
    }
    throw error;
  }

  console.log(HELP);
  console.log(`Studio → ${origin}`);
  console.log(`Hooks  → POST ${hookUrl}\n`);
  if (!args.install) {
    console.log("To attach the current folder's Codex CLI:\n");
    console.log(`  npx agent-think-map codex --install --port ${args.port}\n`);
  }
  if (args.open) openBrowser(origin);
}

startCodexStudio().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
