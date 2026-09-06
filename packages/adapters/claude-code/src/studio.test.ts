import { afterEach, describe, expect, it, vi } from "vitest";
import { get, type Server } from "node:http";
import { createClaudeCodeStudio, studioPage } from "./studio.js";
import { ClaudeCodeTraceHub } from "./hub.js";

async function listen(hub = new ClaudeCodeTraceHub({ path: ":memory:", now: () => 1 })) {
  const server = createClaudeCodeStudio({ dbPath: ":memory:",
    hub,
    root: process.cwd(),
    hookToken: "test-token",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("createClaudeCodeStudio", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await close(server);
    server = undefined;
  });

  it("accepts a Claude Code HTTP hook and lists the session", async () => {
    const started = await listen();
    server = started.server;
    const response = await fetch(`${started.url}/hook?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "cli-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Read README",
      }),
    });
    expect(response.status).toBe(200);
    const sessions = await (await fetch(`${started.url}/sessions`, { headers: { Origin: started.url } })).json();
    expect(sessions).toEqual([
      expect.objectContaining({ id: "cli-1", prompt: "Read README", live: true }),
    ]);
  });

  it("replays protocol events on the session SSE stream", async () => {
    const hub = new ClaudeCodeTraceHub({ path: ":memory:", now: () => 2 });
    await hub.ingest({
      session_id: "cli-1",
      hook_event_name: "UserPromptSubmit",
      prompt: "Read README",
    });
    const started = await listen(hub);
    server = started.server;
    const abort = new AbortController();
    const stream = await fetch(`${started.url}/sse?session=cli-1`, {
      signal: abort.signal,
      headers: { accept: "text/event-stream", Origin: started.url },
    });
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("no body");
    const chunk = await reader.read();
    abort.abort();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain('"type":"run.started"');
    expect(text).toContain("Read README");
  });

  it("removes a session from the list", async () => {
    const hub = new ClaudeCodeTraceHub({ path: ":memory:", now: () => 3 });
    await hub.ingest({
      session_id: "cli-1",
      hook_event_name: "UserPromptSubmit",
      prompt: "Read README",
    });
    const started = await listen(hub);
    server = started.server;
    const response = await fetch(`${started.url}/sessions/cli-1`, { method: "DELETE", headers: { Origin: started.url } });
    expect(response.status).toBe(204);
    expect(await (await fetch(`${started.url}/sessions`, { headers: { Origin: started.url } })).json()).toEqual([]);
  });

  it("rejects missing and wrong tokens before parsing or ingestion", async () => {
    const hub = new ClaudeCodeTraceHub({ path: ":memory:" });
    const ingest = vi.spyOn(hub, "ingest");
    const started = await listen(hub);
    server = started.server;
    for (const suffix of ["", "?token=wrong"]) {
      const response = await fetch(started.url + "/hook" + suffix, { method: "POST", body: "invalid JSON" });
      expect(response.status).toBe(403);
    }
    expect(ingest).not.toHaveBeenCalled();
  });

  it("rejects foreign origins before reads, subscriptions, deletions, and preflights", async () => {
    const hub = new ClaudeCodeTraceHub({ path: ":memory:" });
    const ingest = vi.spyOn(hub, "ingest");
    const list = vi.spyOn(hub, "list");
    const subscribe = vi.spyOn(hub, "subscribe");
    const drop = vi.spyOn(hub, "drop");
    const started = await listen(hub);
    server = started.server;
    for (const Origin of ["https://evil.example", "null", started.url + ".evil.example"]) {
      for (const [path, method] of [["/sessions", "GET"], ["/sse?session=cli-1", "GET"], ["/sessions/cli-1", "DELETE"], ["/hooks.json", "GET"], ["/api/future", "GET"], ["/sessions", "OPTIONS"], ["/hook?token=test-token", "POST"]]) {
        const response = await fetch(started.url + path, { method, headers: { Origin } });
        expect(response.status).toBe(403);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      }
    }
    expect(list).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it("only advertises the Studio origin on preflight", async () => {
    const started = await listen();
    server = started.server;
    const response = await fetch(started.url + "/sessions", { method: "OPTIONS", headers: { Origin: started.url } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(started.url);
    const local = await fetch(started.url + "/sessions", { method: "OPTIONS" });
    expect(local.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects a rebound Host even without an Origin", async () => {
    const started = await listen();
    server = started.server;
    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(started.url + "/sessions", { headers: { Host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    expect(status).toBe(403);
  });

  it("publishes the injected token in hook configuration", async () => {
    const started = await listen();
    server = started.server;
    const body = await (await fetch(started.url + "/hooks.json")).text();
    expect(body).toContain(started.url + "/hook?token=test-token");
  });

  it("generates distinct random tokens accepted by their own servers", async () => {
    const tokens = [];
    for (let i = 0; i < 2; i++) {
      server = createClaudeCodeStudio({ dbPath: ":memory:", root: process.cwd() });
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      const base = `http://127.0.0.1:${address.port}`;
      const config = await (await fetch(base + "/hooks.json")).text();
      const token = config.match(/token=([a-f0-9]{64})/)?.[1];
      expect(token).toBeDefined();
      tokens.push(token);
      expect((await fetch(base + "/hook?token=" + token, { method: "POST", body: JSON.stringify({ session_id: "random", hook_event_name: "UserPromptSubmit", prompt: "hello" }) })).status).toBe(200);
      await close(server);
      server = undefined;
    }
    expect(tokens[0]).not.toBe(tokens[1]);
  });

});

describe("studioPage", () => {
  it("hosts the split viewer so inspector, timeline, and zoom stay in the shell", async () => {
    const html = studioPage();
    expect(html).toContain('layout="split"');
    expect(html).toContain('replay="false"');
    expect(html).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(html).toContain("overflow: hidden");
    expect(html).toContain("Remove session");
    expect(html).toContain('placeholder="Filter sessions"');
    expect(html).toContain("Excalifont");
    expect(html).not.toContain("Figtree");
    expect(html).not.toContain("Syne");
  });
});
