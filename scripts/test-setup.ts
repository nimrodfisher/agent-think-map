import { build } from "tsup";

export default async function setup() {
  // CLI integration tests exercise the same ahead-of-time entry as installs.
  // Build only this small internal entry; leave all user CDN artifacts intact.
  await build({
    entry: ["src/hook-forward.ts"], outDir: "dist/lib", config: false,
    format: ["esm"], platform: "node", target: "es2022",
    splitting: false, dts: false, clean: false, silent: true,
  });
}
