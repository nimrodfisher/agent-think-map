import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173/agent-think-map/",
    browserName: "chromium",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/demo-e2e-server.mjs",
    url: "http://127.0.0.1:4173/agent-think-map/",
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
