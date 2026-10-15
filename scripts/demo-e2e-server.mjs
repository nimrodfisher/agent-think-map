// Build and preview sequentially without shell-specific command chaining.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// test-demo-e2e.mjs owns the isolated HOME and cleanup, even when Playwright
// force-terminates this preview process on Windows.
const env = { ...process.env, GITHUB_PAGES_BASE: "/agent-think-map/" };
const vite = join(root, "node_modules/vite/bin/vite.js");
let child;
const cleanup = () => {
  child?.kill();
};
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
function run(args) {
  child = spawn(process.execPath, [vite, ...args], {
    cwd: join(root, "apps/demo"), env, stdio: "inherit", windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
}
const built = await run(["build"]);
if (built !== 0) process.exit(built);
process.exit(await run(["preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"]));
