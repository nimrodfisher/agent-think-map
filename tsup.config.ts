import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/react.ts", "src/element.ts", "src/claude.ts", "src/claude-code.ts", "src/openai.ts"],
  outDir: "dist/lib",
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: true,
  noExternal: [/\.css$/],
  injectStyle: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  tsconfig: "tsconfig.lib.json",
  external: ["node:fs", "node:path", "node:http", "node:crypto", "node:os", "node:child_process"],
});
