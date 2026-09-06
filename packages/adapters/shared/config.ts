import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export function parseConfig(raw: string): Record<string, any> {
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Hook configuration must be a JSON object; repair it before installing.");
  return value;
}
export function readConfig(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "{}\n";
}

// Never unlink the destination as a rename fallback: failure must leave it intact.
export function atomicWrite(file: string, raw: string, replace = renameSync, flush = fsyncSync): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temp, "wx", existsSync(file) ? statSync(file).mode & 0o777 : 0o600);
    writeFileSync(fd, raw);
    flush(fd);
    closeSync(fd); fd = undefined;
    replace(temp, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temp)) unlinkSync(temp);
  }
}
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
let lastBackupTime = 0;
export function writeConfig(file: string, before: string, value: Record<string, any>, exactRaw?: string): string {
  const after = exactRaw ?? `${JSON.stringify(value, null, 2)}\n`;
  parseConfig(before);
  parseConfig(after);
  lastBackupTime = Math.max(Date.now(), lastBackupTime + 1);
  const backup = `${file}.${new Date(lastBackupTime).toISOString().replaceAll(":", "-")}.${randomUUID()}.bak`;
  atomicWrite(backup, before);
  atomicWrite(`${backup}.installed.json`, JSON.stringify({ beforeHash: hash(before), after }));
  if (readConfig(file) !== before) throw new Error("Configuration changed during installation; retry. The original backup is safe.");
  atomicWrite(file, after);
  return backup;
}
export function backups(file: string): string[] {
  if (!existsSync(dirname(file))) return [];
  return readdirSync(dirname(file)).filter(name => name.startsWith(`${basename(file)}.`) && name.endsWith(".bak"))
    .sort().reverse().map(name => join(dirname(file), name));
}
const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
// Three-way undo: preserve user edits made after installation.
function undo(before: any, after: any, current: any): any {
  if (equal(current, after)) return before;
  if (equal(before, after)) return current;
  if (Array.isArray(after) && Array.isArray(current)) {
    const old = Array.isArray(before) ? before : [];
    if ([...old, ...after, ...current].every(group => group && Array.isArray(group.hooks))) {
      const key = ({ hooks: _hooks, ...matcher }: any) => JSON.stringify(matcher);
      const contains = (groups: any[], group: any, hook: any) => groups.some(g => key(g) === key(group) && g.hooks.some((h: any) => equal(h, hook)));
      const kept = current.flatMap(group => {
        const hooks = group.hooks.filter((hook: any) => !contains(after, group, hook) || contains(old, group, hook));
        return hooks.length ? [{ ...group, hooks }] : [];
      });
      for (const group of old) {
        const missing = group.hooks.filter((hook: any) => !contains(after, group, hook) && !contains(kept, group, hook));
        if (!missing.length) continue;
        const match = kept.find(g => key(g) === key(group));
        if (match) match.hooks.push(...missing); else kept.push({ ...group, hooks: missing });
      }
      return kept;
    }
    const kept = current.filter(item => !after.some(a => equal(a, item) && !old.some(b => equal(a, b))));
    return [...kept, ...old.filter(b => !after.some(a => equal(a, b)) && !kept.some(c => equal(c, b)))];
  }
  if (after && current && typeof after === "object" && typeof current === "object" && !Array.isArray(current)) {
    const result = { ...current };
    for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
      const value = undo(before?.[key], after[key], current[key]);
      if (value === undefined) delete result[key]; else result[key] = value;
    }
    return result;
  }
  return current;
}
function readBackup(backup: string) {
  const raw = readFileSync(backup, "utf8");
  const before = parseConfig(raw);
  const metadata = JSON.parse(readFileSync(`${backup}.installed.json`, "utf8"));
  if (!metadata || typeof metadata.after !== "string") throw new SyntaxError("Invalid backup metadata");
  if (metadata.beforeHash !== hash(raw)) throw new Error("Backup checksum mismatch");
  return { raw, before, after: parseConfig(metadata.after) };
}
function invalidBackup(error: unknown) {
  return error instanceof SyntaxError || error instanceof Error && /checksum|ENOENT|JSON object/.test(error.message);
}
export function rollbackConfig(file: string, selected?: string): string {
  const candidates = backups(file);
  if (selected && !candidates.some(path => resolve(path) === resolve(selected))) throw new Error("Select a backup belonging to this config using its full path.");
  for (const backup of selected ? [resolve(selected)] : candidates) {
    let raw: string;
    let before: Record<string, any>;
    let after: Record<string, any>;
    try {
      ({ raw, before, after } = readBackup(backup));
    } catch (error) {
      if (selected) throw error;
      // Only invalid backup data is skippable, never a failed config write.
      if (!invalidBackup(error)) throw error;
      continue;
    }
    const currentRaw = readConfig(file);
    const current = parseConfig(currentRaw);
    let restored = current;
    // Selecting an older installation also undoes newer installer transactions,
    // in reverse order, preserving the user edits between those installations.
    const index = candidates.findIndex(path => resolve(path) === resolve(backup));
    for (const newer of candidates.slice(0, index)) {
      try {
        const transaction = readBackup(newer);
        restored = undo(transaction.before, transaction.after, restored);
      } catch (error) { if (!invalidBackup(error)) throw error; }
    }
    restored = undo(before, after, restored);
    // Back up the current state too, making rollback itself recoverable.
    writeConfig(file, currentRaw, restored, equal(restored, before) ? raw : undefined);
    return backup;
  }
  throw new Error("No valid backup found. Reinstall hooks to create a recoverable configuration.");
}
