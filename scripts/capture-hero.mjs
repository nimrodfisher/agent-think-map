import { chromium } from "playwright";
import { copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fallbacks = ["http://localhost:5174/", "http://localhost:5173/"];

async function resolveDemoUrl() {
  if (process.env.DEMO_URL) return process.env.DEMO_URL;
  for (const candidate of fallbacks) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return candidate;
    } catch {
      /* try next */
    }
  }
  return fallbacks[0];
}

async function captureReplay(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Replay turn" }).click();
  await page.waitForTimeout(5_400);
}

const url = await resolveDemoUrl();
console.log("capturing", url);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
});
await captureReplay(page, url);
const mcp = page.locator(".atc-node--mcp").first();
if ((await mcp.count()) > 0) {
  await mcp.click();
  await page.waitForTimeout(250);
}
await page.screenshot({ path: "docs/hero.png", type: "png" });

const og = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 2,
});
await captureReplay(og, url);
await og.screenshot({ path: "docs/og.png", type: "png" });
await browser.close();

const optimizePy = join(dirname(fileURLToPath(import.meta.url)), "optimize-hero-png.py");
const result = spawnSync("python", [optimizePy], { encoding: "utf8" });
if (result.status !== 0) {
  console.warn("png optimize skipped:", result.stderr || result.stdout);
} else {
  process.stdout.write(result.stdout);
}

copyFileSync("docs/og.png", "apps/demo/public/og.png");
console.log("wrote docs/hero.png, docs/og.png, apps/demo/public/og.png");
