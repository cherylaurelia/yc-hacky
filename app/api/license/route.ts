import { readJson } from "@/lib/body";
import { LS_DOWN, activateLicense } from "@/lib/license";
import { rateLimit } from "@/lib/ratelimit";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

// POST { key } -> { plan, instanceId }: activates a Lemon Squeezy license key for this browser.
// The page keeps the key and sends it as x-terminal1-license. The key is never logged here.
export async function POST(req: Request) {
  const limited = rateLimit(req, "license");
  if (limited) return limited;
  const read = await readJson(req, 1024);
  if (!read.ok) return read.res;
  const key = (read.body as { key?: unknown } | null)?.key;
  if (typeof key !== "string" || !key.trim()) return fail(400, "Paste your license key.");

  const r = await activateLicense(key);
  if (!r.valid) return fail(r.reason === LS_DOWN ? 503 : 400, r.reason);
  return Response.json({ plan: r.plan, instanceId: r.instanceId }, { headers: { "Cache-Control": "no-store" } });
}
