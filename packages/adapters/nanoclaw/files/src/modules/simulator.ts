/**
 * Host module. Copy to src/modules/simulator.ts and import from the module barrel.
 * Serves SSE at /webhook/simulator. Delivery should call publishTrace() for
 * messages_out rows with kind === "trace" and must not send those rows to chat adapters.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

type TraceEvent = { type: string; [key: string]: unknown };

const clients = new Set<ServerResponse>();
const recent: TraceEvent[] = [];
const MAX_RECENT = 400;

export function publishTrace(event: TraceEvent): void {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(frame);
    } catch {
      clients.delete(client);
    }
  }
}

export function simulatorWebhook(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(":\n\n");
  for (const event of recent) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
  });
}

async function register(): Promise<void> {
  const candidates = ["../webhook-server.ts", "../webhook-server.js", "./webhook-server.js"];
  for (const spec of candidates) {
    try {
      const mod = (await import(spec)) as {
        registerWebhookHandler?: (path: string, handler: typeof simulatorWebhook) => void;
      };
      if (typeof mod.registerWebhookHandler === "function") {
        mod.registerWebhookHandler("simulator", simulatorWebhook);
        return;
      }
    } catch {
      /* try next */
    }
  }
}

void register();
