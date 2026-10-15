import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const room = mkdtempSync(join(tmpdir(), "atm-demo-e2e-"));
const home = join(room, "home");
mkdirSync(home);
// Keep the installed test browser discoverable while isolating runtime HOME.
const cache = process.platform === "win32"
  ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
  : process.platform === "darwin" ? join(homedir(), "Library", "Caches")
    : process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
try {
  const child = spawn(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)], {
    cwd: root, stdio: "inherit", windowsHide: true,
    env: { ...process.env, HOME: home, USERPROFILE: home,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || join(cache, "ms-playwright") },
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  rmSync(room, { recursive: true, force: true });
}
