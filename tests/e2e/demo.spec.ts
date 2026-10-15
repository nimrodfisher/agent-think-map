import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const repo = "https://github.com/nimrodfisher/agent-think-map";
const canonical = "https://nimrodfisher.github.io/agent-think-map/";
const commands = [
  "npx agent-think-map@latest claude --install",
  "npx agent-think-map@latest codex --install",
  "npx agent-think-map@latest claude --import-history --dry-run",
  "npx agent-think-map@latest claude --import-history",
  "npx agent-think-map@latest claude",
];

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function setupAndLinks(page: Page) {
  await expect(page.getByRole("heading", { name: "Continue in local Studio" })).toBeVisible();
  await expect(page.getByText("Requires Node >=22.13.0.", { exact: true })).toBeVisible();
  const code = (await page.locator(".demo-setup code").allTextContents()).join("\n").split("\n");
  expect(code).toEqual(commands);
  await expect(page.getByText(/Local trace data may contain prompts\/tool content/)).toBeVisible();
  await expect(page.getByText(/not hosted Studio history, Problems or Compare/)).toBeVisible();
  await expect(page.getByText(/No upload, account, backend or telemetry/)).toBeVisible();
  await expect(page.getByText(/No automatic diagnosis or chain-of-thought guarantee/)).toBeVisible();
  await expect(page.getByText(/honor its existing consent prompt/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hook-free history import · Claude only" })).toBeVisible();
  const readme = readFileSync("README.md", "utf8");
  const headings = [...readme.matchAll(/^#+ (.+)$/gm)].map(match =>
    match[1].toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s/g, "-"));
  for (const link of await page.locator("body a").all()) {
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    if (href!.startsWith("#")) await expect(page.locator(href!)).toHaveCount(1);
    else {
      expect(href!.split("#")[0]).toBe(repo);
      if (href!.includes("#")) expect(headings).toContain(href!.split("#")[1]);
    }
  }
  await expect(page.getByRole("link", { name: "GitHub repository", exact: true })).toHaveAttribute("href", repo);
}

test.beforeEach(async ({ page }) => {
  // Keep CI offline: external fonts are optional. Unexpected requests fail below.
  await page.route("**/*", route => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
    return route.abort();
  });
});

for (const width of [320, 390, 1280]) {
  test(`investigate, select, switch and replay at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const requests: string[] = [];
    page.on("request", request => requests.push(request.url()));
    const assets: { url: string; status: number }[] = [];
    page.on("response", response => {
      if (response.url().includes("/assets/")) assets.push({ url: response.url(), status: response.status() });
    });
    await page.goto("./");
    await expect(page.getByRole("combobox", { name: "Sample" })).toHaveValue("failure");
    // Exercise the early request as well as eventual evidence and actual graph.
    await page.getByRole("button", { name: "Inspect the failed step" }).click();
    const inspector = page.locator(".atc-inspector");
    await expect(inspector).toContainText("EACCES");
    await expect(inspector).toContainText("./config/app.json");
    await expect(inspector).toBeFocused();
    await expect(page.locator(".atc-timeline button")).toHaveCount(3);
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.locator(".react-flow__node .is-failed")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Answer \(unverified\),/ })).toContainText("120ms");
    await expect(page.getByLabel("Run totals")).toContainText("400ms total");
    await expect(inspector).toBeInViewport();
    await expect(inspector.getByText(/EACCES:/)).toBeInViewport();
    const graph = await page.locator(".react-flow").boundingBox();
    expect(graph?.height).toBeGreaterThanOrEqual(300);
    expect(graph?.width).toBeGreaterThanOrEqual(280);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`evidence-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`viewport-evidence-${width}.png`) });
    await testInfo.attach(`evidence-${width}`, { path: testInfo.outputPath(`evidence-${width}.png`), contentType: "image/png" });
    if (width === 1280) await page.locator(".demo-showcase").screenshot({ path: testInfo.outputPath("hero.png") });

    // Keyboard selection via the shared tape, plus actual canvas selection.
    const answer = page.getByRole("button", { name: /Answer \(unverified\),/ });
    await answer.focus();
    await page.keyboard.press("Enter");
    await expect(inspector.getByRole("heading")).toHaveText("Answer (unverified)");
    await expect(inspector).not.toContainText("EACCES");
    await page.locator('.react-flow__node[data-id="synthetic-config-read"]').click();
    await expect(inspector).toContainText("EACCES");
    await page.getByRole("button", { name: "Inspect the failed step" }).click();
    await expect(inspector).toBeFocused();

    await page.getByRole("button", { name: "Replay sample" }).click();
    await expect(inspector).not.toContainText("EACCES");
    await expect(page.locator(".atc-timeline button")).toHaveCount(3);
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.locator(".atc-span[aria-current]")).toHaveText(/User/);
    await page.getByRole("combobox", { name: "Sample" }).selectOption("github");
    await expect(page.getByRole("button", { name: "Inspect the failed step" })).toHaveCount(0);
    await expect(page.locator(".atc-timeline button")).toHaveCount(6);
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    await expect(page.getByLabel("Run totals")).toContainText("1s total");
    await expect(page.locator(".atc-node.is-failed")).toHaveCount(0);
    await expect(page.locator(".demo-player")).not.toContainText("EACCES");
    await page.getByRole("button", { name: /^Read,/ }).click();
    await expect(inspector).toContainText("src/Login.tsx");
    await page.getByRole("button", { name: "Replay sample" }).click();
    await expect(inspector).not.toContainText("src/Login.tsx");
    await expect(page.locator(".atc-timeline button")).toHaveCount(6);
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    await expect(page.getByLabel("Run totals")).toContainText("1s total");
    await expect(page.locator(".demo-player")).not.toContainText("EACCES");
    await noOverflow(page);
    await setupAndLinks(page);
    expect(assets.some(asset => asset.url.endsWith(".js"))).toBe(true);
    expect(assets.some(asset => asset.url.endsWith(".css"))).toBe(true);
    expect(assets.every(asset => asset.url.startsWith("http://127.0.0.1:4173/agent-think-map/assets/") && asset.status === 200)).toBe(true);
    expect(requests.filter(url => !url.startsWith("http://127.0.0.1:4173/"))
      .every(url => /^(https:\/\/fonts\.(googleapis|gstatic)\.com\/|https:\/\/cdn\.jsdelivr\.net\/npm\/@excalidraw\/)/.test(url))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("useful HTML and consistent metadata without JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/agent-think-map/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("agent-think-map");
  await expect(page.getByText("Find the step worth investigating, without rereading the whole run.")).toBeVisible();
  await expect(page.getByText(/This synthetic sample shows a failed file read/)).toBeVisible();
  await setupAndLinks(page);
  await noOverflow(page);
  await expect(page.locator("title")).toHaveCount(1);
  await expect(page).toHaveTitle("agent-think-map - Visual debugger for AI agents");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", await page.title());
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toContain("synthetic failed-Read canvas sample");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", description!);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", canonical);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${canonical}og.png`);
  const socialImage = await page.request.get("http://127.0.0.1:4173/agent-think-map/og.png");
  expect(socialImage.status()).toBe(200);
  expect(socialImage.headers()["content-type"]).toContain("image/png");
  const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(structured["@graph"][0].url).toBe(canonical);
  expect(JSON.stringify(structured)).toContain("synthetic failed file read");
  await expect(page.locator('link[rel="stylesheet"][href^="/agent-think-map/assets/"]')).toHaveCount(1);
  // CSS really applied even though no module script ran.
  expect(await page.locator(".demo-shell").evaluate(element => getComputedStyle(element).paddingLeft)).toBe("12px");
  await page.screenshot({ path: testInfo.outputPath("no-javascript-390.png"), fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});
