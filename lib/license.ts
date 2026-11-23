// Pro and Team licenses are Lemon Squeezy (LS) license keys, checked live against LS: the server has no database.
// The routes that spend our ElevenLabs credits call licenseGate() first. Server-side only: the key is never logged.
// Setup: LICENSE_REQUIRED=1, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_PRODUCT_IDS (comma list), LEMONSQUEEZY_TEAM_PRODUCT_IDS.

export type Plan = "pro" | "team";
export type Verdict = { valid: boolean; plan: Plan | null; reason: string };
type Env = Record<string, string | undefined>;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Entry = { verdict: Verdict; at: number; okAt?: number };
export type Opts = { fetch?: Fetch; now?: () => number; env?: Env; cache?: Map<string, Entry>; instanceId?: string };

const LS = "https://api.lemonsqueezy.com/v1/licenses";
export const LICENSE_HEADER = "x-terminal1-license";
export const LS_DOWN = "I could not reach the license server just now. Try again in a minute.";
const VALID_MS = 10 * 60_000;
const INVALID_MS = 60_000;
const GRACE_MS = 24 * 3_600_000;
const MAX_ENTRIES = 1000;
const MAX_KEY = 128;

const shared = new Map<string, Entry>();
const no = (reason: string): Verdict => ({ valid: false, plan: null, reason });
const ids = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

type LsBody = {
  valid?: boolean;
  activated?: boolean;
  error?: string | null;
  license_key?: { status?: string };
  instance?: { id?: string };
  meta?: { store_id?: number | string; product_id?: number | string; variant_name?: string };
};

// null means LS could not answer (network, timeout, 429, 5xx), as opposed to answering "no".
async function ask(path: "validate" | "activate", key: string, o: Opts, extra: Record<string, string> = {}): Promise<LsBody | null> {
  try {
    const res = await (o.fetch ?? fetch)(`${LS}/${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: key, ...extra }),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.status === 429 || res.status >= 500) return null;
    return (await res.json()) as LsBody;
  } catch (e) {
    console.error("license: Lemon Squeezy unreachable:", e instanceof Error ? e.name : "unknown error");
    return null;
  }
}

// A key from another LS store, or for another product, is a valid LS key but not ours.
function judge(b: LsBody, env: Env, allowInactive = false): Verdict {
  const store = env.LEMONSQUEEZY_STORE_ID?.trim();
  const team = ids(env.LEMONSQUEEZY_TEAM_PRODUCT_IDS);
  const products = [...ids(env.LEMONSQUEEZY_PRODUCT_IDS), ...team];
  if (!store || !products.length) return no("Licenses are not set up on this server.");
  const status = b.license_key?.status;
  if (status === "expired") return no("That license has expired.");
  if (status === "disabled") return no("That license has been turned off.");
  if (b.valid !== true) return no("That license key is not valid.");
  const product = String(b.meta?.product_id);
  if (String(b.meta?.store_id) !== store || !products.includes(product)) return no("That license key is not for Terminal 1.");
  if (status !== "active" && !(allowInactive && status === "inactive")) return no("That license key has not been activated yet.");
  return { valid: true, plan: team.includes(product) || /team/i.test(b.meta?.variant_name ?? "") ? "team" : "pro", reason: "ok" };
}

export async function validateLicense(key: string, o: Opts = {}): Promise<Verdict> {
  const k = key.trim();
  if (!k) return no("Voice needs a Terminal 1 Pro license.");
  if (k.length > MAX_KEY) return no("That license key is not valid.");
  const now = (o.now ?? Date.now)();
  const cache = o.cache ?? shared;
  const hit = cache.get(k);
  if (hit && now - hit.at < (hit.verdict.valid ? VALID_MS : INVALID_MS)) return hit.verdict;

  const body = await ask("validate", k, o, o.instanceId ? { instance_id: o.instanceId } : {});
  if (!body) {
    if (hit?.okAt === undefined || now - hit.okAt >= GRACE_MS) return no(LS_DOWN);
    cache.set(k, { ...hit, at: now - VALID_MS + 15_000 }); // keep serving it, and ask LS again in 15 s
    return hit.verdict;
  }
  const verdict = judge(body, o.env ?? process.env);
  cache.delete(k); // re-insert so Map order stays oldest-first for eviction
  cache.set(k, { verdict, at: now, okAt: verdict.valid ? now : undefined });
  for (const old of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(old);
  }
  return verdict;
}

// Checks the key is ours before activating, so a stranger's LS key does not use up one of its seats.
export async function activateLicense(key: string, o: Opts = {}): Promise<Verdict & { instanceId?: string }> {
  const k = key.trim();
  if (!k || k.length > MAX_KEY) return no("That license key is not valid.");
  const pre = await ask("validate", k, o);
  if (!pre) return no(LS_DOWN);
  const ours = judge(pre, o.env ?? process.env, true);
  if (!ours.valid) return ours;
  const act = await ask("activate", k, o, { instance_name: "Terminal 1 web" });
  if (!act) return no(LS_DOWN);
  if (act.activated !== true || !act.instance?.id) return no((act.error ?? "That license key could not be activated.").slice(0, 200));
  return { ...ours, instanceId: act.instance.id };
}

// null lets the request through; otherwise the 402 to send. Off unless LICENSE_REQUIRED=1, so dev and self-hosting keep working.
export async function licenseGate(req: Request, o: Opts = {}): Promise<Response | null> {
  if ((o.env ?? process.env).LICENSE_REQUIRED !== "1") return null;
  const v = await validateLicense(req.headers.get(LICENSE_HEADER) ?? "", o);
  if (v.valid) return null;
  const error = v.reason === LS_DOWN ? v.reason : `${v.reason} See the pricing page to get one.`;
  return Response.json({ error, upgrade: "/pricing" }, { status: 402, headers: { "Cache-Control": "no-store" } });
}
