import { readFileSync } from "node:fs";
import { decideCodexConsent } from "./consent.js";
import { forwardHookPayload } from "./forward.js";

const urlFlag = process.argv.findIndex((arg) => arg === "--url");
const hookUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined;
if (!hookUrl) process.exit(2);
const body = readFileSync(0, "utf8");

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
    const result = await forwardHookPayload(payload, hookUrl);
    if (!result.ok) console.error("Agent Think Map: Studio rejected a hook event. Check --doctor and reinstall hooks after restarting Studio.");
  } catch {
    // Think Map is advisory. A stopped studio must not fail a Codex operation.
    console.error("Agent Think Map: a hook event could not reach Studio. Check that Studio is running and run --doctor.");
  }
}
process.exit(0);
