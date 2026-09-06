import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/storage.ts", "src/index.ts", "src/react.ts", "src/element.ts", "src/claude.ts", "src/claude-code.ts", "src/openai.ts", "src/hook-forward.ts"],
  outDir: "dist/lib",
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  // sqlite is prefix-only; stripping node: turns it into a nonexistent npm import.
  removeNodeProtocol: false,
  dts: true,
  noExternal: [/\.css$/],
  injectStyle: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  tsconfig: "tsconfig.lib.json",
  external: ["node:sqlite", "node:fs", "node:path", "node:http", "node:crypto", "node:os", "node:child_process"],
});
