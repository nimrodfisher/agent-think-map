// This is intentionally outside Vitest: it packs, installs and tests in a new
// directory outside the monorepo, with no workspace aliases or TS runtime loader.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
assert(npmCli, "Run this test with npm run test:package");
const room = mkdtempSync(join(tmpdir(), "atm-package-"));
const home = join(room, "home"); mkdirSync(home);
const env = { ...process.env, HOME: home, USERPROFILE: home, NODE_PATH: "", NODE_OPTIONS: "" };
function run(args, cwd = room) {
  return execFileSync(process.execPath, args, { cwd, env, windowsHide: true, timeout: 180000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const npm = (args, cwd) => run([npmCli, ...args], cwd);
const children = new Set();
try {
  console.log("Packing with prepack build...");
  npm(["pack", "--pack-destination", room], root);
  const tarball = readdirSync(room).find(name => name.endsWith(".tgz")); assert(tarball);
  writeFileSync(join(room, "package.json"), JSON.stringify({ name: "atm-clean-room", private: true, type: "module" }));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const version = name => `${name}@${lock.packages[`node_modules/${name}`].version}`;
  npm(["install", "--no-audit", "--no-fund", join(room, tarball), ...["react", "react-dom", "typescript", "@types/react", "@types/node", "vite", "jsdom"].map(version)]);
  const installed = join(room, "node_modules", "agent-think-map");
  const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  assert(!existsSync(join(room, "node_modules", "@agent-think-map")), "No workspace packages may leak into the consumer");
  for (const [key, value] of Object.entries(pkg.exports)) {
    if (key.endsWith(".css")) { assert(existsSync(join(installed, value))); continue; }
    assert.match(value.import, /^\.\/dist\/lib\/.*\.js$/);
    assert.match(value.types, /^\.\/dist\/lib\/.*\.d\.ts$/);
    assert(!value.require && !value.default, "Exports must be honestly ESM-only");
    assert(existsSync(join(installed, value.import))); assert(existsSync(join(installed, value.types)));
    assert(!readFileSync(join(installed, value.types), "utf8").includes("/src/"));
  }
  writeFileSync(join(room, "imports.mjs"), `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { githubIssueFixture, reduceTraceAll, TraceAdapter } from 'agent-think-map';
    import { ClaudeTraceAdapter } from 'agent-think-map/claude';
    import { ClaudeCodeHookAdapter, createClaudeCodeStudio } from 'agent-think-map/claude-code';
    import * as openai from 'agent-think-map/openai';
    import * as codex from 'agent-think-map/codex';
    import { AgentSimulator, createTraceStore } from 'agent-think-map/react';
    assert.equal(typeof TraceAdapter, 'function');
    assert.equal(typeof ClaudeTraceAdapter, 'function');
    assert.equal(typeof ClaudeCodeHookAdapter, 'function');
    assert.equal(typeof createClaudeCodeStudio, 'function');
    assert.deepEqual(Object.keys(openai), Object.keys(codex));
    assert(Object.keys(reduceTraceAll(githubIssueFixture).nodes).length > 0);
    assert.equal(typeof AgentSimulator, 'function'); assert.equal(typeof createTraceStore, 'function');
    assert(import.meta.resolve('agent-think-map').endsWith('/dist/lib/index.js'));
    const require = createRequire(import.meta.url);
    assert.throws(() => require('agent-think-map'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    console.log('PASS: plain Node ESM API and explicit CommonJS rejection');
  `);
  console.log(run(["imports.mjs"]).trim());
  writeFileSync(join(room, "types.mts"), `
    import { TraceAdapter, type AgentTraceEvent } from 'agent-think-map';
    import { AgentSimulator, type AgentSimulatorProps } from 'agent-think-map/react';
    import { AgentSimulatorElement } from 'agent-think-map/element';
    import { ClaudeTraceAdapter } from 'agent-think-map/claude';
    import { ClaudeCodeHookAdapter } from 'agent-think-map/claude-code';
    import * as openai from 'agent-think-map/openai';
    import * as codex from 'agent-think-map/codex';
    const props: AgentSimulatorProps = {}; const event: AgentTraceEvent | undefined = undefined;
    void [TraceAdapter, AgentSimulator, AgentSimulatorElement, ClaudeTraceAdapter, ClaudeCodeHookAdapter, openai, codex, props, event];
  `);
  run([join(room, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "types.mts"]);
  console.log("PASS: public declarations resolve in a standalone TypeScript consumer");
  writeFileSync(join(room, "index.html"), '<div id="app"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(room, "main.js"), `import { TraceAdapter } from 'agent-think-map'; import { AgentSimulator } from 'agent-think-map/react'; import 'agent-think-map/element'; import 'agent-think-map/styles.css'; window.packageSmoke = { TraceAdapter, AgentSimulator };`);
  run([join(room, "node_modules/vite/bin/vite.js"), "build"]);
  writeFileSync(join(room, "browser.mjs"), `
    import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
    import { readdirSync } from 'node:fs'; import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path';
    const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'http://localhost' });
    for (const name of ['window', 'document', 'HTMLElement', 'customElements', 'MutationObserver', 'navigator']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
    const js = readdirSync('dist/assets').find(name => name.endsWith('.js'));
    await import(pathToFileURL(resolve('dist/assets', js)));
    assert(customElements.get('agent-think-map')); assert(customElements.get('agent-simulator'));
    assert.equal(typeof window.packageSmoke.AgentSimulator, 'function');
    assert([...document.querySelectorAll('style')].some(style => style.textContent.includes('.react-flow')));
    assert([...document.querySelectorAll('style')].some(style => style.textContent.includes('.atc-root')));
    dom.window.close(); console.log('PASS: Vite bundle executes, registers elements and preserves styles');
  `);
  console.log(run(["browser.mjs"]).trim());
  const cli = join(installed, "bin", "cli.mjs");
  for (const adapter of ["claude", "codex"]) {
    assert.match(run([cli, adapter, "--help"]), /--doctor/);
    const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const args = [cli, adapter, "--install", "--no-open", "--port", String(port)];
    const child = spawn(process.execPath, args, { cwd: room, env, windowsHide: true, detached: process.platform !== "win32", stdio: "pipe" }); children.add(child);
    let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    const deadline = Date.now() + 20000;
    while (!output.includes('Wrote') && Date.now() < deadline && child.exitCode === null) await new Promise(resolve => setTimeout(resolve, 100));
    assert(output.includes('Wrote'), `Packed ${adapter} install failed: ${output}`);
    // Async child allows the Studio process to ingest while the doctor runs.
    assert.match(run([cli, adapter, "--doctor", "--port", String(port)]), /Doctor OK: observed synthetic event/);
    assert.match(run([cli, adapter, "--rollback"]), /Restored hooks/);
    console.log(`PASS: packed ${adapter} CLI starts Studio, installs, observes doctor and rolls back`);
  }
  console.log("PASS: clean-room npm pack/install/import verification complete");
} catch (error) {
  console.error(error.stdout?.toString() ?? ""); console.error(error.stderr?.toString() ?? ""); throw error;
} finally {
  for (const child of children) {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
    } else {
      // Stop the isolated process group, including the CLI worker.
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
    }
    await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once("exit", resolve); });
  }
  rmSync(room, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
