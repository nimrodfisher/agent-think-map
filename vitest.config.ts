import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./scripts/test-setup.ts"],
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "apps/demo/src/**/*.test.ts", "apps/demo/src/**/*.test.tsx"],
    environment: "node",
    environmentMatchGlobs: [
      ["apps/demo/src/**/*.test.tsx", "jsdom"],
      ["packages/react/**/*.test.tsx", "jsdom"],
      ["packages/web-component/**/*.test.ts", "jsdom"],
    ],
  },
});
