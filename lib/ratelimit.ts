// In-memory token buckets. State lives in one server process, so on a serverless host each warm
// instance counts for itself: a real limit per instance, a soft one across instances.
export class Limiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private perMin: number;
  private maxKeys: number;

  constructor(perMin: number, maxKeys = 5000) {
    this.perMin = perMin;
    this.maxKeys = maxKeys;
  }

  // 0 means allowed (one token spent). Otherwise the whole seconds until a token is back.
  take(key: string, now = Date.now()): number {
    const b = this.buckets.get(key) ?? { tokens: this.perMin, at: now };
    b.tokens = Math.min(this.perMin, b.tokens + ((now - b.at) * this.perMin) / 60_000);
    b.at = now;
    this.buckets.delete(key);
    this.buckets.set(key, b);
    if (this.buckets.size > this.maxKeys) this.evict(now);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil(((1 - b.tokens) * 60) / this.perMin));
  }

  // Idle for a minute means refilled, so forgetting it changes nothing. If everything is busy, drop the least recent.
  private evict(now: number) {
    for (const [k, b] of this.buckets) if (now - b.at >= 60_000) this.buckets.delete(k);
    while (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
  }
}

// Per client, plus an optional ceiling across all clients so rotating IPs cannot drain the credits.
export const LIMITS = {
  speak: { perMin: 20, globalPerMin: 120 },
  standup: { perMin: 3, globalPerMin: 20 },
  tool: { perMin: 60, globalPerMin: 600 },
  write: { perMin: 10, globalPerMin: 60 },
  board: { perMin: 60, globalPerMin: 600 },
  convai: { perMin: 10, globalPerMin: 120 },
  scribe: { perMin: 20, globalPerMin: 300 },
} as const;

export type LimitName = keyof typeof LIMITS;

const limiters = Object.fromEntries(
  Object.entries(LIMITS).map(([name, l]) => [name, { client: new Limiter(l.perMin), global: new Limiter(l.globalPerMin) }]),
) as Record<LimitName, { client: Limiter; global: Limiter }>;

// The caller's address is only believable behind a proxy that sets it. Vercel does; anywhere else
// set TRUST_PROXY=1. The last entry is the one our own proxy appended, so a client cannot fake it.
function clientKey(req: Request, login?: string): string {
  if (login) return `user:${login.toLowerCase()}`;
  if (process.env.VERCEL || process.env.TRUST_PROXY) {
    const ip = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (ip) return `ip:${ip}`;
  }
  return "ip:direct";
}

// Returns the 429 to send, or null when the request may go ahead. Pass `login` once the caller
// is signed in so each person gets their own bucket instead of sharing their network's.
export function rateLimit(req: Request, name: LimitName, login?: string, now = Date.now()): Response | null {
  const l = limiters[name];
  const wait = l.client.take(clientKey(req, login), now) || l.global.take("all", now);
  if (!wait) return null;
  return Response.json(
    { error: `You're going a little fast. Try again in ${wait === 1 ? "a second" : `${wait} seconds`}.` },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
