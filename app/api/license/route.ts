import { readJson } from "@/lib/body";
import { LS_DOWN, activateLicense } from "@/lib/license";
import { rateLimit } from "@/lib/ratelimit";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

// POST { key, instanceId? } -> { plan, instanceId }: activates a Lemon Squeezy license key for this browser.
// A browser that already holds a seat sends its instanceId and gets the same one back, so re-entering the key burns no seat.
// The page keeps both and sends them as x-terminal1-license and x-terminal1-instance. The key is never logged here.
export async function POST(req: Request) {
  const limited = rateLimit(req, "license");
  if (limited) return limited;
  const read = await readJson(req, 1024);
  if (!read.ok) return read.res;
  const { key, instanceId } = (read.body ?? {}) as { key?: unknown; instanceId?: unknown };
  if (typeof key !== "string" || !key.trim()) return fail(400, "Paste your license key.");

  const r = await activateLicense(key, typeof instanceId === "string" ? instanceId : undefined);
  if (!r.valid) return fail(r.reason === LS_DOWN ? 503 : 400, r.reason);
  return Response.json({ plan: r.plan, instanceId: r.instanceId }, { headers: { "Cache-Control": "no-store" } });
}
