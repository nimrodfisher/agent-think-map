import { routeStudioApi, apiError } from "../../shared/studio-api.js";
import { studioHistoryPage } from "../../shared/studio-history.js";
import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TraceEnvelopeV1 } from "../../../protocol/src/index.js";
import { ClaudeCodeTraceHub, claudeCodeHookSettings } from "./hub.js";

export interface ClaudeCodeStudioOptions {
  hub?: ClaudeCodeTraceHub;
  root: string;
  origin?: string;
  hookToken?: string;
  dbPath?: string;
}

function formatSse(event: TraceEnvelopeV1): string {
  return `id: ${event.sequence}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

function mime(path: string): string {
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  return "text/plain";
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 1024 * 1024) throw new Error("Hook body exceeds 1 MiB limit");
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function studioPage(): string { return studioHistoryPage("Claude Code"); }

export function createClaudeCodeStudio(options: ClaudeCodeStudioOptions): Server {
  const hub = options.hub ?? new ClaudeCodeTraceHub({ path: options.dbPath });
  const hookToken = options.hookToken ?? randomBytes(32).toString("hex");
  if (!hookToken) throw new Error("hookToken must not be empty");
  const cdnJs = join(options.root, "dist", "element.cdn.js");
  const css = existsSync(join(options.root, "dist", "styles.css"))
    ? join(options.root, "dist", "styles.css")
    : join(options.root, "packages", "react", "src", "styles.css");

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    // Use the configured/bound address, never the untrusted Host header.
    const address = server.address();
    const origin = options.origin ?? `http://127.0.0.1:${address && typeof address !== "string" ? address.port : 80}`;
    if (req.headers.host !== new URL(origin).host) {
      apiError(res,403,"forbidden_host","Forbidden host");
      return;
    }
    if (req.headers.origin !== undefined && req.headers.origin !== origin) {
      apiError(res,403,"forbidden_origin","Forbidden origin");
      return;
    }
    if (req.headers.origin === origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/hook") {
      if (url.searchParams.get("token") !== hookToken) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
      try {
        const body = JSON.parse(await readBody(req) || "{}") as unknown;
        const events = await hub.ingest(body);
        const name =
          body && typeof body === "object" && "hook_event_name" in body
            ? String((body as { hook_event_name?: unknown }).hook_event_name)
            : "unknown";
        console.log(`hook ${name} → ${events.length} event(s)`);
        res.writeHead(200, {
          "Content-Type": "application/json",
        });
        res.end("{}");
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Invalid hook" }));
      }
      return;
    }

    if (await routeStudioApi(req, res, url, hub)) return;

    if (url.pathname === "/hooks.json") {
      res.setHeader("Cache-Control", "no-store");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(claudeCodeHookSettings(`${origin}/hook?token=${encodeURIComponent(hookToken)}`), null, 2));
      return;
    }

    if (url.pathname === "/sse") {
      const session = url.searchParams.get("session");
      if (!session) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("session query required");
        return;
      }
      const cursor = Number(req.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) { res.writeHead(400); res.end("Invalid SSE cursor"); return; }
      await hub.ready;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();
      const stop = hub.subscribeEnvelopes(session, cursor, (event) => {
        if (res.destroyed) return;
        res.write(formatSse(event));
      });
      req.on("close", stop);
      return;
    }

    if (url.pathname === "/element.js") {
      if (!existsSync(cdnJs)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Run npm run build:cdn first");
        return;
      }
      res.writeHead(200, { "Content-Type": mime(cdnJs) });
      res.end(readFileSync(cdnJs));
      return;
    }

    if (url.pathname === "/styles.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end(readFileSync(css));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(studioPage());
  });
  server.on("close", () => { void hub.close(); });
  return server;
}
