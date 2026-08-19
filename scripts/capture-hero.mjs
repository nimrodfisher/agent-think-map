import { chromium } from "playwright";
import { copyFileSync } from "node:fs";

const url = process.env.DEMO_URL ?? "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.getByRole("button", { name: "Replay turn" }).click();
await page.waitForTimeout(5_400);
const mcp = page.locator(".atc-node--mcp").first();
if ((await mcp.count()) > 0) {
  await mcp.click();
  await page.waitForTimeout(250);
}
await page.screenshot({ path: "docs/hero.png", type: "png" });

const og = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
await og.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await og.getByRole("button", { name: "Replay turn" }).click();
await og.waitForTimeout(5_400);
await og.screenshot({ path: "docs/og.png", type: "png" });
copyFileSync("docs/og.png", "apps/demo/public/og.png");

await browser.close();
console.log("wrote docs/hero.png, docs/og.png, apps/demo/public/og.png");
