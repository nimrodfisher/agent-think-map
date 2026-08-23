import { describe, expect, it } from "vitest";
import { formatSql, prettifyJson, prettifyToolInput } from "./sql.js";

describe("formatSql", () => {
  it("puts major clauses on their own lines", () => {
    expect(
      formatSql(
        "SELECT status, SUM(monthly_price) AS total_monthly_price, COUNT(*) AS n FROM subscriptions GROUP BY status;",
      ),
    ).toBe(
      [
        "SELECT status, SUM(monthly_price) AS total_monthly_price, COUNT(*) AS n",
        "FROM subscriptions",
        "GROUP BY status;",
      ].join("\n"),
    );
  });
});

describe("prettifyToolInput", () => {
  it("extracts and formats SQL from a JSON MCP payload", () => {
    const raw =
      '{"project_id":"gmtrkkyfxmqfmoznzpgp","query":"SELECT status, SUM(monthly_price) AS total_monthly_price, COUNT(*) AS n\\nFROM subscriptions\\nGROUP BY status;"}';
    const pretty = prettifyToolInput(raw);
    expect(pretty.hasSql).toBe(true);
    expect(pretty.pretty).toContain("project_id: gmtrkkyfxmqfmoznzpgp");
    expect(pretty.pretty).toContain("FROM subscriptions");
    expect(pretty.pretty).not.toContain("\\n");
  });

  it("does not claim SQL for ordinary tool JSON", () => {
    expect(prettifyToolInput('{"file_path":"README.md"}').hasSql).toBe(false);
  });
});

describe("prettifyJson", () => {
  it("pretty-prints compact JSON for the inspector", () => {
    expect(prettifyJson('{"project_id":"abc","limit":10}')).toBe(
      ['{', '  "project_id": "abc",', '  "limit": 10', '}'].join("\n"),
    );
  });

  it("returns undefined for non-JSON text", () => {
    expect(prettifyJson("not json")).toBeUndefined();
  });

  it("recovers pretty JSON from a truncated object", () => {
    expect(prettifyJson('{"ok":true,"rows":[{"a":1},{"b":')).toContain('"ok": true');
  });
});
