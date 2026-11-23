// Pro and Team licenses are Lemon Squeezy (LS) license keys, checked live against LS: the server has no database.
// The routes that spend our ElevenLabs credits call licenseGate() first. Server-side only: the key is never logged.
// A key alone unlocks nothing: each device activates the key once (one seat) and sends the instance id LS gave it.
// Setup: LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_PRODUCT_IDS (comma list), LEMONSQUEEZY_TEAM_PRODUCT_IDS. The gate is on when
// LICENSE_REQUIRED=1, or when a store id is set and LICENSE_REQUIRED is not 0.

import { Limiter } from "./ratelimit.ts";

export type Plan = "pro" | "team";
export type Verdict = { valid: boolean; plan: Plan | null; reason: string };
type Env = Record<string, string | undefined>;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Entry = { verdict: Verdict; at: number; okAt?: number };
// ok: answers LS gave yes to, by key and instance. bad: LS's no, kept apart and small so junk keys cannot push real ones out.
// calls: the cap on requests we send LS, so no flood of made-up keys can run us into LS's own rate limit.
export type Cache = { ok: Map<string, Entry>; bad: Map<string, Entry>; calls: Limiter };
export type Opts = { fetch?: Fetch; now?: () => number; env?: Env; cache?: Cache };

const LS = "https://api.lemonsqueezy.com/v1/licenses";
export const LICENSE_HEADER = "x-terminal1-license";
export const INSTANCE_HEADER = "x-terminal1-instance";
export const LS_DOWN = "I could not reach the license server just now. Try again in a minute.";
export const NEED_ACTIVATION = "This device is not activated yet. Enter your license key to activate it.";
const BAD_KEY = "That license key is not valid.";
const VALID_MS = 10 * 60_000;
const INVALID_MS = 60_000;
const GRACE_MS = 24 * 3_600_000;
const MAX_OK = 1000;
const MAX_BAD = 100;
const LS_CALLS_PER_MIN = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // LS keys and instance ids are UUIDs

export const newCache = (): Cache => ({ ok: new Map(), bad: new Map(), calls: new Limiter(LS_CALLS_PER_MIN) });
const shared = newCache();
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

// null means LS could not answer (over our own call cap, network, timeout, 429, 5xx), as opposed to answering "no".
async function ask(path: "validate" | "activate", fields: Record<string, string>, o: Opts): Promise<LsBody | null> {
  if ((o.cache ?? shared).calls.take("ls", (o.now ?? Date.now)())) {
    console.error("license: over the Lemon Squeezy call cap for this minute");
    return null;
  }
  try {
    const res = await (o.fetch ?? fetch)(`${LS}/${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
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
// Without an instance id this is the check before activating, so an inactive key passes. With one, the key must be
// active and LS must say this device holds a seat on it.
function judge(b: LsBody, env: Env, instance?: string): Verdict {
  const store = env.LEMONSQUEEZY_STORE_ID?.trim();
  const team = ids(env.LEMONSQUEEZY_TEAM_PRODUCT_IDS);
  const products = [...ids(env.LEMONSQUEEZY_PRODUCT_IDS), ...team];
  if (!store || !products.length) return no("Licenses are not set up on this server.");
  const status = b.license_key?.status;
  if (status === "expired") return no("That license has expired.");
  if (status === "disabled") return no("That license has been turned off.");
  if (b.valid !== true) return no(BAD_KEY);
  const product = String(b.meta?.product_id);
  if (String(b.meta?.store_id) !== store || !products.includes(product)) return no("That license key is not for Terminal 1.");
  if (status !== "active" && !(instance === undefined && status === "inactive")) return no("That license key has not been activated yet.");
  if (instance !== undefined && b.instance?.id !== instance) return no(NEED_ACTIVATION);
  return { valid: true, plan: team.includes(product) || /team/i.test(b.meta?.variant_name ?? "") ? "team" : "pro", reason: "ok" };
}

function remember(m: Map<string, Entry>, id: string, e: Entry, max: number) {
  m.delete(id); // re-insert so Map order stays oldest-first for eviction
  m.set(id, e);
  for (const old of m.keys()) {
    if (m.size <= max) break;
    m.delete(old);
  }
}

// Does LS say this key, on this device's seat, is ours and in good standing? A key or instance id that cannot be one costs no call.
export async function validateLicense(key: string, instanceId: string, o: Opts = {}): Promise<Verdict> {
  const k = key.trim();
  const inst = instanceId.trim();
  if (!k) return no("Voice needs a Terminal 1 Pro license.");
  if (!UUID.test(k)) return no(BAD_KEY);
  if (!UUID.test(inst)) return no(NEED_ACTIVATION);
  const now = (o.now ?? Date.now)();
  const cache = o.cache ?? shared;
  const id = `${k}:${inst}`;
  const hit = cache.ok.get(id);
  if (hit && now - hit.at < VALID_MS) return hit.verdict;
  const miss = cache.bad.get(id);
  if (miss && now - miss.at < INVALID_MS) return miss.verdict;

  const body = await ask("validate", { license_key: k, instance_id: inst }, o);
  if (!body) {
    if (hit?.okAt === undefined || now - hit.okAt >= GRACE_MS) return no(LS_DOWN);
    cache.ok.set(id, { ...hit, at: now - VALID_MS + 15_000 }); // keep serving it, and ask LS again in 15 s
    return hit.verdict;
  }
  const verdict = judge(body, o.env ?? process.env, inst);
  cache.ok.delete(id); // LS's newest answer replaces the old one, so a refunded key loses its grace
  cache.bad.delete(id);
  if (verdict.valid) remember(cache.ok, id, { verdict, at: now, okAt: now }, MAX_OK);
  else remember(cache.bad, id, { verdict, at: now }, MAX_BAD);
  return verdict;
}

// Checks the key is ours before activating, so a stranger's LS key does not use up one of its seats.
// A device that sends the instance id it already holds, and LS still honours it, gets that seat back instead of a second one.
export async function activateLicense(key: string, existing: string | undefined, o: Opts = {}): Promise<Verdict & { instanceId?: string }> {
  const k = key.trim();
  if (!UUID.test(k)) return no(BAD_KEY);
  if (existing?.trim()) {
    const v = await validateLicense(k, existing, o);
    if (v.valid) return { ...v, instanceId: existing.trim() };
    if (v.reason === LS_DOWN) return v;
  }
  const pre = await ask("validate", { license_key: k }, o);
  if (!pre) return no(LS_DOWN);
  const ours = judge(pre, o.env ?? process.env);
  if (!ours.valid) return ours;
  const act = await ask("activate", { license_key: k, instance_name: "Terminal 1 web" }, o);
  if (!act) return no(LS_DOWN);
  if (act.activated !== true || !act.instance?.id) return no((act.error ?? "That license key could not be activated.").slice(0, 200));
  return { ...ours, instanceId: act.instance.id };
}

// On with LICENSE_REQUIRED=1, or when a store is configured and LICENSE_REQUIRED is not 0. Off otherwise, so dev and self-hosting keep working.
export const licenseRequired = (env: Env): boolean => env.LICENSE_REQUIRED === "1" || (!!env.LEMONSQUEEZY_STORE_ID?.trim() && env.LICENSE_REQUIRED !== "0");

// null lets the request through; otherwise the 402 to send.
export async function licenseGate(req: Request, o: Opts = {}): Promise<Response | null> {
  if (!licenseRequired(o.env ?? process.env)) return null;
  const v = await validateLicense(req.headers.get(LICENSE_HEADER) ?? "", req.headers.get(INSTANCE_HEADER) ?? "", o);
  if (v.valid) return null;
  const error = v.reason === LS_DOWN || v.reason === NEED_ACTIVATION ? v.reason : `${v.reason} See the pricing page to get one.`;
  return Response.json({ error, upgrade: "/pricing" }, { status: 402, headers: { "Cache-Control": "no-store" } });
}
