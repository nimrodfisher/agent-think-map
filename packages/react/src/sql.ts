const CLAUSES = [
  "UNION ALL",
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "FULL OUTER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  "GROUP BY",
  "ORDER BY",
  "PARTITION BY",
  "INSERT INTO",
  "DELETE FROM",
  "SELECT",
  "FROM",
  "WHERE",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "JOIN",
  "WITH",
  "VALUES",
];

const SQL_START =
  /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|EXPLAIN|ALTER|MERGE)\b/i;

const SQL_KEYS = new Set(["query", "sql", "statement"]);

export function looksLikeSql(text: string): boolean {
  return SQL_START.test(text);
}

export function formatSql(sql: string): string {
  let text = sql.replace(/\s+/g, " ").trim();
  const sorted = [...CLAUSES].sort((left, right) => right.length - left.length);
  for (const clause of sorted) {
    const pattern = new RegExp(`\\s+(${clause})\\b`, "gi");
    text = text.replace(pattern, (_, matched: string) => `\n${matched}`);
  }
  return text;
}

export function prettifyToolInput(input: string): { hasSql: boolean; pretty: string } {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rows: string[] = [];
      let sql: string | undefined;
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string" && (SQL_KEYS.has(key.toLowerCase()) || looksLikeSql(value))) {
          sql = value;
          continue;
        }
        rows.push(
          `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
        );
      }
      if (sql) {
        const pretty = [...rows, "", formatSql(sql)].join("\n").trim();
        return { hasSql: true, pretty };
      }
    }
  } catch {
    /* not JSON */
  }
  if (looksLikeSql(input)) {
    return { hasSql: true, pretty: formatSql(input) };
  }
  return { hasSql: false, pretty: input };
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* try to close a truncated object or array */
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new SyntaxError("not json");
  }

  let candidate = trimmed;
  let inString = false;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === '"' && candidate[i - 1] !== "\\") inString = !inString;
  }
  if (inString) candidate += '"';
  candidate = candidate
    .replace(/,?\s*"[^"]*"\s*:\s*$/, "")
    .replace(/:\s*$/, "")
    .replace(/,\s*$/, "");

  const stack: string[] = [];
  inString = false;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === '"' && candidate[i - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  candidate = candidate.replace(/,\s*$/, "");
  candidate += [...stack].reverse().join("");
  return JSON.parse(candidate);
}

export function prettifyJson(text: string): string | undefined {
  try {
    return JSON.stringify(parseJsonLoose(text), null, 2);
  } catch {
    return undefined;
  }
}
