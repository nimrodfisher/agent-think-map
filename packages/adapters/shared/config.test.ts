import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWrite, backups, readConfig, rollbackConfig, writeConfig } from "./config.js";
import { installClaudeCodeHooks } from "../claude-code/src/install.js";
import { installCodexHooks } from "../codex/src/install.js";

const dirs: string[] = [];
const temp = () => { const dir = fs.mkdtempSync(join(tmpdir(), "atm-recovery-")); dirs.push(dir); return dir; };
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

for (const adapter of ["claude", "codex"] as const) {
  describe(`${adapter} recoverable installation`, () => {
    function setup() {
      const cwd = temp(); const home = temp();
      const file = adapter === "claude" ? join(cwd, ".claude", "settings.local.json") : join(home, ".codex", "hooks.json");
      fs.mkdirSync(join(file, ".."), { recursive: true });
      const original = '{ "permissions": { "allow": ["Read"] }, "hooks": { "Stop": [{"hooks":[{"type":"command","command":"echo keep"}]}] } }\n';
      fs.writeFileSync(file, original);
      const install = () => adapter === "claude" ? installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=one") : installCodexHooks(cwd, "http://127.0.0.1:3335/hook?token=one", "cli.mjs", "user", home);
      return { file, original, install };
    }
    it("keeps unrelated settings, saves exact timestamped backups, and restores exact bytes", () => {
      const { file, original, install } = setup(); install();
      expect(JSON.parse(readConfig(file)).permissions).toEqual({ allow: ["Read"] });
      expect(readConfig(file)).toContain("echo keep");
      const backup = backups(file)[0];
      expect(backup).toMatch(/\.\d{4}-\d\d-\d\dT.*\.bak$/);
      expect(fs.readFileSync(backup, "utf8")).toBe(original);
      expect(rollbackConfig(file, backup)).toBe(backup);
      expect(readConfig(file)).toBe(original);
    });
    it("rolls back only installed changes while retaining later unrelated edits", () => {
      const { file, original, install } = setup(); install();
      const backup = backups(file)[0];
      const edited = JSON.parse(readConfig(file));
      edited.permissions.allow.push("Write"); edited.theme = "dark";
      edited.hooks.Custom = [{ hooks: [{ type: "command", command: "echo later" }] }];
      fs.writeFileSync(file, JSON.stringify(edited));
      rollbackConfig(file, backup);
      const restored = JSON.parse(readConfig(file));
      expect(restored).toEqual({ ...JSON.parse(original), permissions: { allow: ["Read", "Write"] }, theme: "dark", hooks: { ...JSON.parse(original).hooks, Custom: edited.hooks.Custom } });
    });
    it("rejects malformed configuration without overwriting it", () => {
      const { file, install } = setup();
      for (const raw of ['{"partial":', '[]', 'null']) {
        fs.writeFileSync(file, raw); expect(install).toThrow(); expect(readConfig(file)).toBe(raw);
      }
      expect(backups(file)).toEqual([]);
    });
    it("skips corrupt latest backups and rejects a selected invalid or foreign backup", () => {
      const { file, install } = setup(); install();
      const valid = backups(file)[0];
      const corrupt = `${file}.9999-invalid.bak`; fs.writeFileSync(corrupt, "{");
      expect(() => rollbackConfig(file, corrupt)).toThrow();
      expect(() => rollbackConfig(file, join(temp(), "foreign.bak"))).toThrow(/belonging/);
      expect(rollbackConfig(file)).toBe(valid);
    });
  });
}

it("failed rename leaves the complete original config and removes temp files", () => {
  const file = join(temp(), "config.json"); fs.writeFileSync(file, '{"original":true}');
  expect(() => atomicWrite(file, '{"new":true}', () => { throw new Error("rename denied"); })).toThrow("rename denied");
  expect(readConfig(file)).toBe('{"original":true}');
  expect(fs.readdirSync(join(file, ".."))).toEqual(["config.json"]);
});
it("failed flush never replaces the config", () => {
  const file = join(temp(), "config.json"); fs.writeFileSync(file, '{}');
  const flush = () => { throw new Error("disk full"); };
  expect(() => atomicWrite(file, '{"new":true}', fs.renameSync, flush)).toThrow("disk full");
  expect(readConfig(file)).toBe('{}');
});
it("detects a config changed since it was read", () => {
  const file = join(temp(), "config.json"); fs.writeFileSync(file, '{"user":"new"}');
  expect(() => writeConfig(file, '{}', { hooks: {} })).toThrow(/changed during/);
  expect(readConfig(file)).toBe('{"user":"new"}');
});



it("an interrupted writer before rename leaves the original complete JSON", async () => {
  const { execFileSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const file = join(temp(), "config.json"); fs.writeFileSync(file, '{"original":true}');
  const ts = await import("typescript");
  const compiled = join(temp(), "config.mjs");
  fs.writeFileSync(compiled, ts.transpileModule(fs.readFileSync(resolve("packages/adapters/shared/config.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const script = `import { atomicWrite } from ${JSON.stringify(pathToFileURL(compiled).href)}; atomicWrite(${JSON.stringify(file)}, '{"new":true}', () => process.exit(91));`;
  expect(() => execFileSync(process.execPath, ["--input-type=module", "-e", script], { windowsHide: true })).toThrow();
  expect(readConfig(file)).toBe('{"original":true}');
  expect(fs.readdirSync(join(file, ".."))).toHaveLength(2);
});

it("preserves unrelated handlers sharing a Codex group during rotation and rollback", () => {
  const cwd = temp();
  const file = installCodexHooks(cwd, "http://127.0.0.1:3335/hook?token=old", "cli.mjs");
  const initial = JSON.parse(readConfig(file));
  initial.hooks.UserPromptSubmit[0].hooks.push({ type: "command", command: "echo keep" });
  fs.writeFileSync(file, JSON.stringify(initial));
  installCodexHooks(cwd, "http://127.0.0.1:3335/hook?token=new", "cli.mjs");
  const backup = backups(file)[0];
  const installed = JSON.parse(readConfig(file));
  expect(readConfig(file)).toContain("echo keep");
  installed.hooks.UserPromptSubmit.at(-1).hooks.push({ type: "command", command: "echo later" });
  fs.writeFileSync(file, JSON.stringify(installed));
  rollbackConfig(file, backup);
  const raw = readConfig(file);
  expect(raw).toContain("echo keep"); expect(raw).toContain("echo later");
  expect(raw).toContain("token=old"); expect(raw).not.toContain("token=new");
});


it("selecting an older backup undoes later installs while retaining intervening user edits", () => {
  const cwd = temp();
  const file = installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=old");
  const oldest = backups(file)[0];
  const userEdit = JSON.parse(readConfig(file)); userEdit.theme = "dark";
  userEdit.hooks.Custom = [{ hooks: [{ type: "command", command: "echo user" }] }];
  fs.writeFileSync(file, JSON.stringify(userEdit));
  installClaudeCodeHooks(cwd, "http://127.0.0.1:3334/hook?token=new");
  rollbackConfig(file, oldest);
  expect(JSON.parse(readConfig(file))).toEqual({ theme: "dark", hooks: { Custom: userEdit.hooks.Custom } });
});
