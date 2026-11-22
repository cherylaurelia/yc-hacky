// Run: node --test lib/ratelimit.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { Limiter, rateLimit } from "./ratelimit.ts";

test("a bucket allows its burst, then says how long to wait, then refills", () => {
  const l = new Limiter(3);
  assert.deepEqual([0, 1, 2].map(() => l.take("a", 0)), [0, 0, 0]);
  assert.equal(l.take("a", 0), 20);
  assert.equal(l.take("a", 10_000), 10);
  assert.equal(l.take("a", 20_000), 0);
});

test("keys do not share a bucket", () => {
  const l = new Limiter(1);
  assert.equal(l.take("a", 0), 0);
  assert.equal(l.take("a", 0), 60);
  assert.equal(l.take("b", 0), 0);
});

test("an idle bucket never holds more than the burst", () => {
  const l = new Limiter(2);
  l.take("a", 0);
  assert.deepEqual([l.take("a", 3_600_000), l.take("a", 3_600_000), l.take("a", 3_600_000)].map((n) => n > 0), [false, false, true]);
});

test("memory is bounded by dropping the least recently used key", () => {
  const l = new Limiter(1, 2);
  l.take("a", 0);
  l.take("b", 1);
  l.take("c", 2);
  assert.equal(l.take("a", 3), 0);
});

test("rateLimit answers 429 with Retry-After and a sentence a voice can say", async () => {
  const req = new Request("http://x/api/standup");
  const first = [rateLimit(req, "standup", "t1", 0), rateLimit(req, "standup", "t1", 0), rateLimit(req, "standup", "t1", 0)];
  assert.deepEqual(first, [null, null, null]);
  const res = rateLimit(req, "standup", "t1", 0)!;
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "20");
  assert.match(((await res.json()) as { error: string }).error, /Try again in 20 seconds/);
  assert.equal(rateLimit(req, "standup", "t2", 0), null);
});

test("a spoofed X-Forwarded-For is ignored unless a proxy is trusted", () => {
  delete process.env.VERCEL;
  delete process.env.TRUST_PROXY;
  const from = (ip: string) => new Request("http://x/api/convai-token", { headers: { "x-forwarded-for": ip } });
  for (let i = 0; i < 10; i++) assert.equal(rateLimit(from(`9.9.9.${i}`), "convai", undefined, 0), null);
  assert.equal(rateLimit(from("1.2.3.4"), "convai", undefined, 0)!.status, 429);
});
