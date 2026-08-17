import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@agent-think-map/react": resolve(root, "packages/react/src/index.ts"),
      "@agent-think-map/core": resolve(root, "packages/core/src/index.ts"),
      "@agent-think-map/protocol": resolve(root, "packages/protocol/src/index.ts"),
    },
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/element.ts"),
      formats: ["es"],
      fileName: () => "element.cdn.js",
    },
    outDir: resolve(root, "dist"),
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "styles.css",
      },
    },
  },
});
