import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn } from "node:child_process";
import { ClaudeCodeTraceHub, claudeCodeHookSettings } from "./hub.js";
import { installClaudeCodeHooks } from "./install.js";
import { createClaudeCodeStudio } from "./studio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const HELP = `
agent-think-map claude — live think-map for Claude Code CLI

  1. Keep this process running. A browser tab opens the session studio.
  2. In the project where you run \`claude\`, install hooks (this folder):

       npx agent-think-map claude --install

  3. In another terminal, in that same folder, run \`claude\` and ask it
     to use a tool (e.g. "Read README.md"). The graph builds in the browser.

  Flags: --port 3334   --install   --print-hooks   --smoke   --no-open
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
  const args = parseArgs(argv);
  const host = "127.0.0.1";
  const origin = `http://${host}:${args.port}`;
  const hookUrl = `${origin}/hook`;

  if (args.printHooks) {
    console.log(JSON.stringify(claudeCodeHookSettings(hookUrl), null, 2));
    return;
  }

  await ensureCdn();

  const installDir = process.env.ATM_CWD || process.cwd();
  if (args.install) {
    const file = installClaudeCodeHooks(installDir, hookUrl);
    console.log(`Wrote Claude Code hooks → ${file}`);
    console.log("Run `claude` in that project. Restart Claude Code if it is already open.\n");
  }

  const hub = new ClaudeCodeTraceHub();
  if (args.smoke) {
    for (const hook of SMOKE) hub.ingest(hook);
  }

  const server = createClaudeCodeStudio({ hub, root, origin });
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
    console.log("To attach the current folder's Claude Code CLI:\n");
    console.log(`  npx agent-think-map claude --install --port ${args.port}\n`);
  }
  if (args.open) openBrowser(origin);
}

startClaudeCodeStudio().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

