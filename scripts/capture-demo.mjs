import { chromium } from "playwright";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const outDir = join("docs", "demo-frames");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const url = process.env.DEMO_URL ?? "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "load", timeout: 30_000 });
await page.waitForTimeout(800);

const frames = 24;
for (let i = 0; i < frames; i++) {
  await page.screenshot({
    path: join(outDir, `frame-${String(i).padStart(2, "0")}.png`),
    type: "png",
  });
  await page.waitForTimeout(400);
}

await page.screenshot({ path: join("apps", "demo", "public", "og.png"), type: "png" });
await browser.close();

const count = readdirSync(outDir).filter((f) => f.endsWith(".png")).length;
console.log(`Wrote ${count} frames to ${outDir} and apps/demo/public/og.png`);
