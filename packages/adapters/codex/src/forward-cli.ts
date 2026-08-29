import { readFileSync } from "node:fs";
import { forwardHookPayload } from "./forward.js";

const urlFlag = process.argv.findIndex((arg) => arg === "--url");
const hookUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined;
if (!hookUrl) process.exit(2);
const body = readFileSync(0, "utf8");
const result = await forwardHookPayload(body, hookUrl);
process.exit(result.ok ? 0 : 1);
