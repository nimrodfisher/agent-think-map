import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    environment: "node",
    environmentMatchGlobs: [
      ["packages/react/**/*.test.tsx", "jsdom"],
      ["packages/web-component/**/*.test.ts", "jsdom"],
    ],
  },
});
