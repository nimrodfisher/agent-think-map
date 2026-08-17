import { describe, expect, it } from "vitest";
import { formatUsageCompact, formatUsageDetail } from "./usage.js";

describe("formatUsageDetail", () => {
  it("formats in/out tokens, cache, and dollar cost", () => {
    expect(
      formatUsageDetail({
        inputTokens: 1204,
        outputTokens: 318,
        cacheReadTokens: 400,
        costUsd: 0.041,
      }),
    ).toEqual({
      tokens: "1,204 in / 318 out",
      cache: "400 read",
      cost: "$0.041",
    });
  });

  it("omits missing fields", () => {
    expect(formatUsageDetail({ outputTokens: 52, costUsd: 0.0012 })).toEqual({
      tokens: "52 out",
      cost: "$0.0012",
    });
  });
});

describe("formatUsageCompact", () => {
  it("shows total tokens and cents when the cost is under a cent", () => {
    expect(formatUsageCompact({ outputTokens: 86, costUsd: 0.0012 })).toBe("86 tok · 0.1¢");
  });

  it("shows thousands of tokens with a dollar cost", () => {
    expect(
      formatUsageCompact({ inputTokens: 1204, outputTokens: 318, costUsd: 0.041 }),
    ).toBe("1.5k tok · $0.041");
  });

  it("returns undefined when usage has no numbers", () => {
    expect(formatUsageCompact({})).toBeUndefined();
  });
});
