import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createCodexStudio, studioPage } from "./studio.js";
import { CodexTraceHub } from "./hub.js";
import { SMOKE } from "./smoke.js";

async function listen(hub = new CodexTraceHub({ now: () => 1 })) {
  const server = createCodexStudio({
    hub,
    root: process.cwd(),
    origin: "http://127.0.0.1:3335",
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

describe("createCodexStudio", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await close(server);
    server = undefined;
  });

  it("accepts a Codex hook and lists the session", async () => {
    const started = await listen();
    server = started.server;
    const response = await fetch(`${started.url}/hook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "cli-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Read README",
        model: "gpt-5.4",
      }),
    });
    expect(response.status).toBe(200);
    const sessions = await (await fetch(`${started.url}/sessions`)).json();
    expect(sessions).toEqual([
      expect.objectContaining({ id: "cli-1", prompt: "Read README", live: true }),
    ]);
  });

  it("lists the smoke session after ingest", async () => {
    const hub = new CodexTraceHub({ now: () => 2 });
    for (const hook of SMOKE) hub.ingest(hook);
    const started = await listen(hub);
    server = started.server;
    const sessions = await (await fetch(`${started.url}/sessions`)).json();
    expect(sessions).toEqual([
      expect.objectContaining({
        id: "smoke",
        prompt: "Read README.md and summarize it",
        model: "gpt-5.4",
      }),
    ]);
  });

  it("replays protocol events on the session SSE stream", async () => {
    const hub = new CodexTraceHub({ now: () => 2 });
    hub.ingest({
      session_id: "cli-1",
      hook_event_name: "UserPromptSubmit",
      prompt: "Read README",
    });
    const started = await listen(hub);
    server = started.server;
    const abort = new AbortController();
    const stream = await fetch(`${started.url}/sse?session=cli-1`, {
      signal: abort.signal,
      headers: { accept: "text/event-stream" },
    });
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("no body");
    const chunk = await reader.read();
    abort.abort();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain('"type":"run.started"');
    expect(text).toContain("Read README");
  });

  it("serves command hooks.json, not HTTP hooks", async () => {
    const started = await listen();
    server = started.server;
    const body = await (await fetch(`${started.url}/hooks.json`)).text();
    expect(body).toContain('"type": "command"');
    expect(body).toContain("hook-forward");
    expect(body).toContain("cli.mjs");
    expect(body).not.toContain("npx agent-think-map");
    expect(body).not.toContain('"type": "http"');
  });

  it("removes a session from the list", async () => {
    const hub = new CodexTraceHub({ now: () => 3 });
    hub.ingest({
      session_id: "cli-1",
      hook_event_name: "UserPromptSubmit",
      prompt: "Read README",
    });
    const started = await listen(hub);
    server = started.server;
    const response = await fetch(`${started.url}/sessions/cli-1`, { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(await (await fetch(`${started.url}/sessions`)).json()).toEqual([]);
  });
});

describe("studioPage", () => {
  it("hosts the split viewer for Codex", () => {
    const html = studioPage();
    expect(html).toContain('layout="split"');
    expect(html).toContain('replay="false"');
    expect(html).toContain("Waiting for Codex");
    expect(html).toContain("Remove session");
    expect(html).toContain("Excalifont");
    expect(html).toContain('session.id !== "smoke"');
    expect(html).toContain("usage.costUsd");
    expect(html).toContain("cacheCreationTokens");
  });
});
