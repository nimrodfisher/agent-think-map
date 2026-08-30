import { readFileSync } from "node:fs";
import { decideCodexConsent } from "./consent.js";
import { forwardHookPayload } from "./forward.js";
import { codexSessionUsage } from "./session-usage.js";

const urlFlag = process.argv.findIndex((arg) => arg === "--url");
const hookUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined;
if (!hookUrl) process.exit(2);
const body = readFileSync(0, "utf8");

function withSessionUsage(payload: string): string {
  try {
    const input = JSON.parse(payload) as Record<string, unknown>;
    const event = input.hook_event_name;
    if (event !== "Stop" && event !== "SessionEnd") return payload;
    const sessionId = typeof input.session_id === "string" ? input.session_id : "";
    const usage = codexSessionUsage(sessionId);
    if (!usage) return payload;
    const existing =
      input.usage && typeof input.usage === "object" && !Array.isArray(input.usage)
        ? input.usage
        : {};
    return JSON.stringify({ ...input, usage: { ...usage, ...existing } });
  } catch {
    return payload;
  }
}

let decision;
try {
  decision = decideCodexConsent(body);
} catch {
  // A malformed hook must never break the Codex session.
  process.exit(0);
}

if (decision.output) process.stdout.write(`${JSON.stringify(decision.output)}\n`);
for (const payload of decision.forward) {
  try {
    await forwardHookPayload(withSessionUsage(payload), hookUrl);
  } catch {
    // Think Map is advisory. A stopped studio must not fail a Codex operation.
  }
}
process.exit(0);
