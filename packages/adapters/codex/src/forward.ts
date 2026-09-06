export async function forwardHookPayload(
  body: string,
  hookUrl: string,
  post: (url: string, payload: string) => Promise<{ ok: boolean }> = async (url, payload) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      // Leave room for Node startup and exit within SessionEnd's 3s limit.
      signal: AbortSignal.timeout(1500),
    });
    return { ok: res.ok };
  },
): Promise<{ ok: boolean }> {
  return post(hookUrl, body);
}
