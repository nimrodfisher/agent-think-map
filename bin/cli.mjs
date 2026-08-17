#!/usr/bin/env node
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cdnJs = join(root, "dist", "element.cdn.js");
const css = existsSync(join(root, "dist", "styles.css"))
  ? join(root, "dist", "styles.css")
  : join(root, "packages", "react", "src", "styles.css");
const fixturePath = join(root, "fixtures", "github-issue.json");

const HELP = `
agent-think-map — watch any AI agent think

  npx agent-think-map          open the live demo
  npm i agent-think-map        React / Node
  CDN (any chat UI)            one script tag, see README

  Your agent only emits JSON. The canvas is just a viewer.
`;

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

function mime(path) {
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html";
  return "text/plain";
}

const arg = process.argv[2];
if (arg === "help" || arg === "--help" || arg === "-h") {
  console.log(HELP);
  process.exit(0);
}

if (!existsSync(cdnJs)) {
  console.log(HELP);
  console.log("Starting the Vite demo (first-time / no CDN build)...\n");
  const child = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  const events = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agent-think-map</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&family=IBM+Plex+Mono:wght@400&family=Syne:wght@700&display=swap" />
  <link rel="stylesheet" href="/styles.css" />
  <style>
    html, body { margin: 0; height: 100%; background: #e4d9c5; }
    agent-simulator { display: block; height: 100%; }
  </style>
</head>
<body>
  <agent-simulator events-url="/sse" layout="overlay"></agent-simulator>
  <script type="module" src="/element.js"></script>
</body>
</html>`;

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/sse")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      for (const event of events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        await new Promise((r) => setTimeout(r, 380));
      }
      return;
    }
    if (url === "/element.js") {
      res.writeHead(200, { "Content-Type": mime(cdnJs) });
      res.end(readFileSync(cdnJs));
      return;
    }
    if (url === "/styles.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end(readFileSync(css));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });

  const port = Number(process.env.PORT) || 3333;
  server.listen(port, () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(HELP);
    console.log(`Demo → ${url}\n`);
    openBrowser(url);
  });
}
