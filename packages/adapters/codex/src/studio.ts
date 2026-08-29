import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentTraceEvent } from "../../../protocol/src/index.js";
import { CodexTraceHub, codexHookSettings, hookForwardCommand } from "./hub.js";

export interface CodexStudioOptions {
  hub?: CodexTraceHub;
  root: string;
  origin?: string;
}

function formatSse(event: AgentTraceEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function mime(path: string): string {
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  return "text/plain";
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function studioPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Codex · agent-think-map</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap" />
  <link rel="stylesheet" href="/styles.css" />
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #e4d9c5; font-family: Excalifont, "Segoe UI", cursive; }
    .studio {
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      height: 100%;
      min-height: 0;
    }
    .rail { min-height: 0; overflow: auto; border-right: 1px solid #c9bba3; background: #f6f0e4; padding: 1rem 0.75rem; font-family: Excalifont, "Segoe UI", cursive; }
    .rail h1 { font-family: Excalifont, "Segoe UI", cursive; font-size: 0.95rem; margin: 0 0 0.25rem; }
    .rail p { margin: 0 0 0.55rem; color: #5c564c; font-size: 0.75rem; }
    .rail input[type="search"] {
      width: 100%; box-sizing: border-box; margin: 0 0 0.45rem; padding: 0.4rem 0.5rem;
      border: 1px solid #c9bba3; background: #e4d9c5; color: #1c1915; font: inherit; font-size: 0.78rem; border-radius: 6px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0 0 0.55rem; }
    .chip {
      appearance: none; border: 1px solid #c9bba3; background: #e4d9c5; color: #5c564c;
      font: inherit; font-size: 0.68rem; padding: 0.18rem 0.45rem; border-radius: 999px; cursor: pointer;
    }
    .chip[aria-pressed="true"] { border-color: #1f6f5b; background: #e8f0ec; color: #1f6f5b; }
    .session-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.25rem; margin: 0 0 0.4rem; align-items: stretch; }
    .session { display: block; width: 100%; text-align: left; border: 1px solid #c9bba3; background: #e4d9c5; border-radius: 8px; padding: 0.5rem 0.6rem; cursor: pointer; font: inherit; }
    .session[aria-current="true"] { border-color: #1f6f5b; background: #e8f0ec; }
    .session strong { display: block; font-size: 0.8rem; }
    .session span { display: block; color: #5c564c; font-size: 0.7rem; line-height: 1.35; }
    .remove {
      appearance: none; width: 1.7rem; border: 1px solid #c9bba3; background: #e4d9c5; color: #5c564c;
      border-radius: 8px; cursor: pointer; font: inherit; line-height: 1;
    }
    .remove:hover, .remove:focus-visible { border-color: #8c2f1b; color: #8c2f1b; }
    .empty { color: #5c564c; font-size: 0.8rem; }
    agent-think-map {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      height: 100%;
    }
  </style>
</head>
<body>
  <div class="studio">
    <aside class="rail">
      <h1>Sessions</h1>
      <p>Live map for this Codex CLI. Click a session.</p>
      <input id="filter-query" type="search" placeholder="Filter sessions" />
      <div class="chips" id="status-filters"></div>
      <div class="chips" id="model-filters"></div>
      <div class="chips" id="effort-filters"></div>
      <div id="sessions" class="empty">Waiting for Codex…</div>
    </aside>
    <agent-think-map id="map" layout="split" replay="false"></agent-think-map>
  </div>
  <script type="module" src="/element.js"></script>
  <script>
    const list = document.getElementById("sessions");
    const map = document.getElementById("map");
    const queryInput = document.getElementById("filter-query");
    const statusFilters = document.getElementById("status-filters");
    const modelFilters = document.getElementById("model-filters");
    const effortFilters = document.getElementById("effort-filters");
    let selected = new URLSearchParams(location.search).get("session");
    let allSessions = [];
    const filter = { query: "", status: "all", model: "", effort: "" };

    function unique(values) {
      return [...new Set(values.filter(Boolean))].sort();
    }

    function filterSessions(sessions) {
      const needle = filter.query.trim().toLowerCase();
      return sessions.filter((session) => {
        if (needle && !(session.prompt + " " + session.id).toLowerCase().includes(needle)) return false;
        if (filter.status === "live" && !session.live) return false;
        if (filter.status === "ended" && session.live) return false;
        if (filter.model && session.model !== filter.model) return false;
        if (filter.effort && session.effort !== filter.effort) return false;
        return true;
      });
    }

    function titleOf(session) {
      const text = session.prompt || session.id;
      return text.length > 48 ? text.slice(0, 45) + "…" : text;
    }

    function metaLine(session) {
      const parts = [session.live ? "live" : "ended"];
      if (session.model) parts.push(String(session.model));
      if (session.effort) parts.push(session.effort);
      const usage = session.usage || {};
      const tokens = (usage.inputTokens || 0) + (usage.outputTokens || 0)
        + (usage.cacheReadTokens || 0) + (usage.cacheCreationTokens || 0);
      if (tokens) parts.push(tokens.toLocaleString("en-US") + " tok");
      parts.push(session.eventCount + " events");
      return parts.join(" · ");
    }

    function chip(label, pressed, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }

    function renderChips() {
      statusFilters.replaceChildren(
        chip("All", filter.status === "all", () => { filter.status = "all"; draw(); }),
        chip("Live", filter.status === "live", () => { filter.status = "live"; draw(); }),
        chip("Ended", filter.status === "ended", () => { filter.status = "ended"; draw(); }),
      );
      const models = unique(allSessions.map((session) => session.model));
      modelFilters.replaceChildren(
        ...models.map((model) => chip(
          String(model),
          filter.model === model,
          () => { filter.model = filter.model === model ? "" : model; draw(); },
        )),
      );
      const efforts = unique(allSessions.map((session) => session.effort));
      effortFilters.replaceChildren(
        ...efforts.map((effort) => chip(
          effort,
          filter.effort === effort,
          () => { filter.effort = filter.effort === effort ? "" : effort; draw(); },
        )),
      );
    }

    function selectSession(id) {
      selected = id;
      map.setAttribute("events-url", "/sse?session=" + encodeURIComponent(id));
      history.replaceState(null, "", "?session=" + encodeURIComponent(id));
    }

    function draw() {
      renderChips();
      const sessions = filterSessions(allSessions);
      if (!allSessions.length) {
        list.className = "empty";
        list.textContent = "Waiting for Codex…";
        return;
      }
      if (!sessions.length) {
        list.className = "empty";
        list.textContent = "No sessions match these filters.";
        return;
      }
      if (!selected || !sessions.some((session) => session.id === selected)) {
        selectSession(sessions[sessions.length - 1].id);
      }
      list.className = "";
      list.replaceChildren();
      for (const session of sessions) {
        const row = document.createElement("div");
        row.className = "session-row";
        const button = document.createElement("button");
        button.className = "session";
        button.type = "button";
        if (session.id === selected) button.setAttribute("aria-current", "true");
        button.innerHTML = "<strong></strong><span></span>";
        button.querySelector("strong").textContent = titleOf(session);
        button.querySelector("span").textContent = metaLine(session);
        button.addEventListener("click", () => {
          selectSession(session.id);
          draw();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove";
        remove.setAttribute("aria-label", "Remove session");
        remove.textContent = "×";
        remove.addEventListener("click", async (event) => {
          event.stopPropagation();
          await fetch("/sessions/" + encodeURIComponent(session.id), { method: "DELETE" });
          if (selected === session.id) selected = null;
          refresh();
        });
        row.append(button, remove);
        list.append(row);
      }
    }

    async function refresh() {
      allSessions = await (await fetch("/sessions")).json();
      draw();
    }

    queryInput.addEventListener("input", () => {
      filter.query = queryInput.value;
      draw();
    });
    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}

export function createCodexStudio(options: CodexStudioOptions): Server {
  const hub = options.hub ?? new CodexTraceHub();
  const cdnJs = join(options.root, "dist", "element.cdn.js");
  const css = existsSync(join(options.root, "dist", "styles.css"))
    ? join(options.root, "dist", "styles.css")
    : join(options.root, "packages", "react", "src", "styles.css");

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/hook") {
      try {
        const body = JSON.parse(await readBody(req) || "{}") as unknown;
        const events = hub.ingest(body);
        const name =
          body && typeof body === "object" && "hook_event_name" in body
            ? String((body as { hook_event_name?: unknown }).hook_event_name)
            : "unknown";
        console.log(`hook ${name} → ${events.length} event(s)`);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end("{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
      }
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/sessions/")) {
      const id = decodeURIComponent(url.pathname.slice("/sessions/".length));
      hub.drop(id);
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      res.end();
      return;
    }

    if (url.pathname === "/sessions") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(hub.list()));
      return;
    }

    if (url.pathname === "/hooks.json") {
      const origin = options.origin ?? `http://127.0.0.1`;
      const command = hookForwardCommand(`${origin}/hook`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(codexHookSettings(command), null, 2));
      return;
    }

    if (url.pathname === "/sse") {
      const session = url.searchParams.get("session");
      if (!session) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("session query required");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      const stop = hub.subscribe(session, (event) => {
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
}
