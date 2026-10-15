// Build and preview sequentially without shell-specific command chaining.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// test-demo-e2e.mjs owns the isolated HOME and cleanup, even when Playwright
// force-terminates this preview process on Windows.
const buildEnv = { ...process.env, GITHUB_PAGES_BASE: "/agent-think-map/" };
const previewEnv = { ...process.env };
delete previewEnv.GITHUB_PAGES_BASE;
const vite = join(root, "node_modules/vite/bin/vite.js");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the browser smoke with npm run test:demo:e2e");
let child;
const cleanup = () => {
  child?.kill();
};
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
function run(args, cwd, env) {
  child = spawn(process.execPath, args, {
    cwd, env, stdio: "inherit", windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
}
const built = await run([vite, "build"], join(root, "apps/demo"), buildEnv);
if (built !== 0) process.exit(built);
process.exit(await run([
  npmCli, "run", "preview", "-w", "@agent-think-map/demo", "--",
  "--host", "127.0.0.1", "--port", "4173", "--strictPort",
], root, previewEnv));
