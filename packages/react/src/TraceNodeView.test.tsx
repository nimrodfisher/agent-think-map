import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TraceNodeView.tsx"), "utf8");

describe("TraceNodeView reduced motion", () => {
  it("skips mount travel when prefers-reduced-motion is reduce", () => {
    expect(source).toContain("initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}");
    expect(source).toContain(
      "transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}",
    );
  });
});
