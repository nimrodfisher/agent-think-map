import { describe, expect, it, vi } from "vitest";
import { forwardHookPayload } from "./forward.js";

describe("forwardHookPayload", () => {
  it("POSTs stdin JSON to the hook URL", async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const body = JSON.stringify({ hook_event_name: "Stop" });
    await expect(
      forwardHookPayload(body, "http://127.0.0.1:3335/hook", post),
    ).resolves.toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith("http://127.0.0.1:3335/hook", body);
  });
});
