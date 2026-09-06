import { createHash } from "node:crypto";
import type { CanonicalOperation, NodeKind } from "../../protocol/src/index.js";

export const FINGERPRINT_VERSION = 1 as const;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function normalizeOperation(operation: CanonicalOperation): {name: string; server?: string} {
  const name = operation.name.trim().toLowerCase();
  // Only known equivalent provider spellings. Shell execution is not the Bash tool.
  const aliases: Record<string,string> = {read_file:"read", write_file:"write", edit_file:"edit"};
  return {name: operation.server ? name : aliases[name] ?? name, ...(operation.server ? {server:operation.server.toLowerCase()} : {})};
}
const volatile = /^(?:.*(?:_id|_uuid|_timestamp)|id|uuid|timestamp|time|ts|created_at|updated_at|nonce|seed|port|count|result_count|total|token|.*(?:password|secret|api_key|apikey|authorization|credential|access_token).*)$/i;
const extension = (s: string) => s.replace(/[?#].*$/, "").match(/\.([a-z0-9]{1,10})$/i)?.[1].toLowerCase() ?? "none";
function urlShape(s: string): unknown {
  try { const u = new URL(s); return {urlHost:u.hostname.toLowerCase(), protocol:u.protocol}; } catch { return "string"; }
}
function sqlShape(s: string): unknown {
  const clean = s.replace(/'[^']*(?:''[^']*)*'/g,"'literal'").replace(/--[^\n]*|\/\*[\s\S]*?\*\//g," ");
  const operation = clean.match(/^\s*(select|insert|update|delete|create|alter|drop|with)\b/i)?.[1].toLowerCase();
  if (!operation) return "string";
  const tables = [...clean.matchAll(/\b(?:from|join|into|update|table)\s+["`\[]?([a-z_][\w.]*)/gi)].map(m=>m[1].toLowerCase());
  return {sql:operation,tables};
}
function commandShape(s: string): unknown {
  // A conservative lexical summary, not a shell parser. Never retain positional literals.
  return (s.match(/(?:"[^"]*"|'[^']*'|[^;&|\n])+/g) ?? []).filter(x=>x.trim()).map(part=> {
    const words = part.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    while (words[0] && /^[A-Za-z_][\w]*=/.test(words[0])) words.shift();
    const raw = (words.shift() ?? "").replace(/^['"]|['"]$/g,"");
    const verb = raw.replace(/\\/g,"/").split("/").at(-1)!.toLowerCase();
    const subcommand = /^(git|npm|pnpm|yarn|docker|cargo|go|kubectl)$/.test(verb) && /^[a-z][a-z-]*$/i.test(words[0] ?? "") ? words.shift()!.toLowerCase() : undefined;
    const script = /^(npm|pnpm|yarn)$/.test(verb) && subcommand === "run" && /^[a-z][a-z0-9:_-]*$/i.test(words[0] ?? "") ? words.shift() : undefined;
    const args = words.map((word,i) => {
      if (i && /^--?(?:token|password|secret|key|authorization|header|H)$/i.test(words[i-1])) return "redacted";
      if (/^--?[a-z]/i.test(word)) return word.split("=")[0];
      if (/^https?:\/\//i.test(word)) return urlShape(word);
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(word)) return {method:word};
      if (/[/.\\]/.test(word)) return {fileExtension:extension(word.replace(/^['"]|['"]$/g,""))};
      return "string";
    });
    return {verb,...(subcommand ? {subcommand}:{}),...(script ? {script}:{}),args};
  });
}
/** V1 intentionally retains structure and selected decisions, never arbitrary literal contents. */
export function normalizeInputShape(value: unknown, key = "", depth = 0): unknown {
  if (depth > 64) return "depth-limit";
  if (volatile.test(key)) return "volatile";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.map(item=>normalizeInputShape(item,key,depth+1));
  if (typeof value === "object") return Object.fromEntries(Object.keys(value as object).filter(k=>!volatile.test(k)).sort().map(k=>[k,normalizeInputShape((value as Record<string,unknown>)[k],k,depth+1)]));
  if (typeof value !== "string") return typeof value;
  if (/^(command|cmd|shell_command)$/i.test(key)) return commandShape(value);
  if (/^(sql|query|statement)$/i.test(key) && /^\s*(select|insert|update|delete|create|alter|drop|with)\b/i.test(value)) return sqlShape(value);
  if (/^(method|http_method)$/i.test(key)) return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(value) ? value.toUpperCase() : "string";
  if (/^https?:\/\//i.test(value)) return urlShape(value);
  if (/(?:path|file|filename|directory|cwd)$/i.test(key) || /^(?:\/|[A-Za-z]:\\|\.\/|~\/)/.test(value)) return {fileExtension:extension(value)};
  if (/^(table|table_name)$/i.test(key)) return /^[a-z_][\w.]*$/i.test(value) ? value.toLowerCase() : "string";
  return "string";
}
export function fingerprint(kind: NodeKind, operation: CanonicalOperation, inputShape: unknown): string {
  return createHash("sha256").update(canonicalJson({version:1,kind,operation:normalizeOperation(operation),inputShape})).digest("hex");
}
