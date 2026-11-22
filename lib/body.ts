const fail = (status: number, error: string) => Response.json({ error }, { status });

// Parses a JSON POST body without ever holding more than `maxBytes` of it. JSON only, so a
// cross-site page cannot send it without a CORS preflight.
export async function readJson(req: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  if (!req.headers.get("content-type")?.includes("application/json")) return { ok: false, res: fail(415, "Send JSON.") };
  const tooBig = { ok: false as const, res: fail(413, "That request is too big.") };
  if (Number(req.headers.get("content-length")) > maxBytes) return tooBig;

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  try {
    for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
      size += r.value.length;
      if (size > maxBytes) {
        await reader!.cancel();
        return tooBig;
      }
      chunks.push(r.value);
    }
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, res: fail(400, "Request body must be JSON.") };
  }
}
