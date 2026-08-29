export async function forwardHookPayload(
  body: string,
  hookUrl: string,
  post: (url: string, payload: string) => Promise<{ ok: boolean }> = async (url, payload) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    return { ok: res.ok };
  },
): Promise<{ ok: boolean }> {
  return post(hookUrl, body);
}
