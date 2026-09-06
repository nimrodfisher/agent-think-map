import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { providerSchema } from "../../protocol/src/index.js";
import type { TraceHub } from "../../core/src/trace-hub.js";
import type { RunFilter } from "../../core/src/run-store.js";

const idSchema = z.string().min(1).max(512).refine(s => !/[\x00-\x1f\x7f/\\]/.test(s), "Invalid run ID");
const patchSchema = z.object({outcome:z.enum(["worked","failed"]).nullable().optional(),bookmarked:z.boolean().optional(),label:z.string().trim().max(120).nullable().optional()}).strict().refine(p => Object.keys(p).length > 0);
const integer = (s: string) => /^\d+$/.test(s) && Number.isSafeInteger(Number(s));
export function parseRunQuery(params: URLSearchParams): RunFilter {
  const result: RunFilter = {};
  const allowed = ["q","provider","model","status","outcome","bookmarked","from","to","cursor","limit"];
  for (const [key,value] of params) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error("Unknown or repeated query parameter");
    if (key === "q" || key === "model") result[key] = z.string().max(256).parse(value);
    if (key === "provider") result.provider = providerSchema.parse(value);
    if (key === "status") result.status = z.enum(["running","completed","failed","interrupted"]).parse(value);
    if (key === "outcome") result.outcome = value === "null" ? null : z.enum(["worked","failed"]).parse(value);
    if (key === "bookmarked") result.bookmarked = z.enum(["true","false"]).parse(value) === "true";
    if (key === "limit") { if (!integer(value) || Number(value) < 1 || Number(value) > 100) throw new Error("limit must be 1..100"); result.pageSize = Number(value); }
    if (key === "from" || key === "to") {
      const date = integer(value) ? Number(value) : (/^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN);
      if (!Number.isFinite(date)) throw new Error("Invalid date bound"); result[key] = date;
    }
    if (key === "cursor") {
      if (value.length > 2048) throw new Error("Invalid cursor");
      const cursor = JSON.parse(value);
      z.tuple([z.number().finite(),idSchema]).parse(cursor); result.cursor = value;
    }
  }
  if (result.from !== undefined && result.to !== undefined && result.from > result.to) throw new Error("from must precede to");
  result.pageSize ??= 20;
  return result;
}
export function apiJson(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}); res.end(JSON.stringify(value));
}
export function apiError(res: ServerResponse, status: number, code: string, message: string) { apiJson(res,status,{error:{code,message}}); }

/** Called only after the provider's existing Host/Origin guard. Legacy sessions is a bounded adapter. */
export async function routeStudioApi(req: IncomingMessage, res: ServerResponse, url: URL, hub: TraceHub): Promise<boolean> {
  const legacy = url.pathname === "/sessions" || url.pathname.startsWith("/sessions/");
  if (!legacy && !url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/api/diffs" || url.pathname.startsWith("/api/diffs/")) {
    let pair: {badRunId:string;goodRunId:string} | undefined; let diffId: string | undefined;
    try {
      if ([...url.searchParams].length) throw new Error("Unexpected query");
      if (url.pathname === "/api/diffs") {
        if (req.method !== "POST") { apiError(res,405,"method_not_allowed","Use POST"); return true; }
        if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) { apiError(res,415,"unsupported_media_type","Use application/json"); return true; }
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4096) throw new Error("Body too large"); chunks.push(Buffer.from(chunk)); }
        pair = z.object({badRunId:idSchema,goodRunId:idSchema}).strict().refine(p=>p.badRunId!==p.goodRunId).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } else {
        if (req.method !== "GET") { apiError(res,405,"method_not_allowed","Use GET"); return true; }
        diffId = z.string().regex(/^[a-f0-9]{64}$/).parse(url.pathname.slice("/api/diffs/".length));
      }
    } catch { apiError(res,400,"invalid_request","Choose two distinct valid run IDs or a valid diff ID"); return true; }
    try {
      const result = pair ? await hub.compareRuns(pair.badRunId,pair.goodRunId) : await hub.getDiff(diffId!);
      if (!result) apiError(res,404,"not_found","Run or current comparison not found; compare again to rebuild");
      else apiJson(res,200,result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("alignment cells")) apiError(res,422,"comparison_too_large","A turn exceeds the comparison limit; split into smaller turns");
      else apiError(res,500,"store_error","Comparison request failed");
    }
    return true;
  }
  let id: string | undefined;
  let events = false;
  let filter: RunFilter | undefined;
  let patch: z.infer<typeof patchSchema> | undefined;
  try {
    if (url.pathname === "/api/runs" || url.pathname === "/sessions") {
      if (req.method !== "GET") { apiError(res,405,"method_not_allowed","Use GET"); return true; }
      filter = parseRunQuery(url.searchParams);
      if (legacy) filter.provider = hub.provider;
    } else {
      const match = url.pathname.match(legacy ? /^\/sessions\/([^/]+)$/ : /^\/api\/runs\/([^/]+)(\/events)?$/);
      if (!match) { apiError(res,404,"not_found","Route not found"); return true; }
      id = idSchema.parse(decodeURIComponent(match[1])); events = Boolean(match[2]);
      if (events ? req.method !== "GET" : !["PATCH","DELETE"].includes(req.method ?? "")) { apiError(res,405,"method_not_allowed","Unsupported method"); return true; }
      if (events) {
        for (const [key,value] of url.searchParams) if (key !== "after" || url.searchParams.getAll(key).length !== 1 || !integer(value)) throw new Error("Invalid event sequence");
      } else if ([...url.searchParams].length) throw new Error("Unexpected query parameters");
      if (req.method === "PATCH") {
        if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) { apiError(res,415,"unsupported_media_type","Use application/json"); return true; }
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4096) throw new Error("Patch body too large"); chunks.push(Buffer.from(chunk)); }
        patch = patchSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      }
    }
  } catch { apiError(res,400,"invalid_request","Invalid run ID, query, or patch"); return true; }
  try {
    if (filter) {
      const page = await hub.listRuns(filter);
      if (legacy) {
        if (page.nextCursor) res.setHeader("X-Next-Cursor",page.nextCursor);
        apiJson(res,200,page.items.map(run => ({...run,id:run.runId,live:run.status === "running"})).reverse());
      } else apiJson(res,200,page);
    } else {
      await hub.ready;
      if (!await hub.store.getRun(id!)) { apiError(res,404,"not_found","Run not found"); return true; }
      if (events) apiJson(res,200,{items:await hub.store.readRun(id!,Number(url.searchParams.get("after") ?? 0))});
      else if (patch) {
        const run = await hub.patchRun(id!,patch);
        if (!run) apiError(res,404,"not_found","Run not found"); else apiJson(res,200,run);
      } else { await hub.drop(id!); res.writeHead(204); res.end(); }
    }
  } catch { apiError(res,500,"store_error","Run store request failed"); }
  return true;
}
