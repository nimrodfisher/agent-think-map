import { chromium } from "playwright";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const outDir = join("docs", "demo-frames");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const url = process.env.DEMO_URL ?? "http://localhost:5173/";
const frameMs = 280;
const frames = 32;
const mcpAtFrame = 20;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.getByRole("button", { name: "Replay turn" }).click();
await page.waitForTimeout(80);

for (let i = 0; i < frames; i++) {
  if (i === mcpAtFrame) {
    const mcp = page.locator(".atc-node--mcp").first();
    if ((await mcp.count()) > 0) {
      await mcp.click({ force: true });
    }
  }
  await page.screenshot({
    path: join(outDir, `frame-${String(i).padStart(2, "0")}.png`),
    type: "png",
  });
  await page.waitForTimeout(frameMs);
}

await browser.close();
const count = readdirSync(outDir).filter((f) => f.endsWith(".png")).length;
console.log(`Wrote ${count} frames to ${outDir}`);
