// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/license.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { LICENSE_HEADER, LS_DOWN, activateLicense, licenseGate, validateLicense } from "./license.ts";

const env = { LICENSE_REQUIRED: "1", LEMONSQUEEZY_STORE_ID: "111", LEMONSQUEEZY_PRODUCT_IDS: "10, 20", LEMONSQUEEZY_TEAM_PRODUCT_IDS: "20" };
const KEY = "38b1460a-5104-4067-a91d-77b872934d51";

const ok = (over: object = {}) => ({
  valid: true,
  error: null,
  license_key: { status: "active" },
  meta: { store_id: 111, product_id: 10, variant_name: "Pro Monthly" },
  ...over,
});
const meta = (over: object) => ({ meta: { store_id: 111, product_id: 10, variant_name: "Pro Monthly", ...over } });

// A stub for fetch: each call answers with the next reply (the last one repeats). An Error is a network failure.
function stub(...replies: (object | number | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const r = replies[Math.min(calls.length, replies.length - 1)];
    calls.push({ url, init });
    if (r instanceof Error) throw r;
    return typeof r === "number" ? new Response("oops", { status: r }) : Response.json(r);
  };
  return { fetch, calls };
}

const clock = (t = 0) => Object.assign(() => t, { set: (n: number) => (t = n) });
const setup = (...replies: (object | number | Error)[]) => ({ ...stub(...replies), cache: new Map(), env });
const withKey = (key?: string) => new Request("http://x/api/speak", { headers: key ? { [LICENSE_HEADER]: key } : {} });

test("a valid pro key unlocks pro, and LS gets a form-encoded validate request", async () => {
  const s = setup(ok());
  const v = await validateLicense(KEY, s);
  assert.deepEqual(v, { valid: true, plan: "pro", reason: "ok" });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, "https://api.lemonsqueezy.com/v1/licenses/validate");
  assert.equal(s.calls[0].init.method, "POST");
  assert.equal((s.calls[0].init.headers as Record<string, string>).Accept, "application/json");
  assert.equal(String(s.calls[0].init.body), `license_key=${KEY}`);
});

test("the instance id is sent when there is one", async () => {
  const s = setup(ok());
  await validateLicense(KEY, { ...s, instanceId: "inst-1" });
  assert.equal(String(s.calls[0].init.body), `license_key=${KEY}&instance_id=inst-1`);
});

test("a key for the team product (or a Team variant) is the team plan", async () => {
  assert.equal((await validateLicense(KEY, setup(ok(meta({ product_id: 20 })))).then((v) => v.plan)), "team");
  assert.equal((await validateLicense(KEY, setup(ok(meta({ variant_name: "Team seat" })))).then((v) => v.plan)), "team");
});

test("a key from someone else's LS store is rejected", async () => {
  const v = await validateLicense(KEY, setup(ok(meta({ store_id: 999 }))));
  assert.equal(v.valid, false);
  assert.equal(v.plan, null);
  assert.match(v.reason, /not for Terminal 1/);
});

test("a key for another product in our store is rejected", async () => {
  const v = await validateLicense(KEY, setup(ok(meta({ product_id: 30 }))));
  assert.equal(v.valid, false);
  assert.match(v.reason, /not for Terminal 1/);
});

test("expired, disabled and not-yet-activated keys are rejected, whatever `valid` says", async () => {
  for (const [license_key, valid, reason] of [
    [{ status: "expired" }, false, /expired/],
    [{ status: "disabled" }, false, /turned off/],
    [{ status: "expired" }, true, /expired/],
    [{ status: "inactive" }, true, /not been activated/],
  ] as const) {
    const v = await validateLicense(KEY, setup(ok({ license_key, valid })));
    assert.equal(v.valid, false);
    assert.match(v.reason, reason);
  }
  assert.equal((await validateLicense(KEY, setup({ valid: false, error: "license_key not found." }))).valid, false);
});

test("a server with no store or products configured lets nothing through", async () => {
  const s = { ...setup(ok()), env: { LICENSE_REQUIRED: "1" } };
  assert.match((await validateLicense(KEY, s)).reason, /not set up/);
});

test("a cached answer avoids a second fetch: ten minutes for valid, one for invalid", async () => {
  const now = clock(0);
  const good = { ...setup(ok()), now };
  await validateLicense(KEY, good);
  now.set(9 * 60_000);
  await validateLicense(KEY, good);
  assert.equal(good.calls.length, 1);
  now.set(10 * 60_000 + 1);
  await validateLicense(KEY, good);
  assert.equal(good.calls.length, 2);

  const t = clock(0);
  const bad = { ...setup({ valid: false, error: "nope" }), now: t };
  await validateLicense("bad", bad);
  t.set(59_000);
  await validateLicense("bad", bad);
  assert.equal(bad.calls.length, 1);
  t.set(61_000);
  await validateLicense("bad", bad);
  assert.equal(bad.calls.length, 2);
});

test("the cache is capped", async () => {
  const s = setup(ok());
  for (let i = 0; i < 1005; i++) await validateLicense(`k${i}`, s);
  assert.equal(s.cache.size, 1000);
  assert.equal(s.cache.has("k0"), false);
  assert.equal(s.cache.has("k1004"), true);
});

test("LS down: a key that validated in the last day is still allowed, and LS is retried within 15 s", async () => {
  for (const down of [new Error("fetch failed"), 503, 429]) {
    const now = clock(0);
    const s = { ...setup(ok(), down), now };
    assert.equal((await validateLicense(KEY, s)).valid, true);
    now.set(11 * 60_000);
    assert.deepEqual(await validateLicense(KEY, s), { valid: true, plan: "pro", reason: "ok" });
    assert.equal(s.calls.length, 2);
    now.set(11 * 60_000 + 5_000);
    assert.equal((await validateLicense(KEY, s)).valid, true);
    assert.equal(s.calls.length, 2, "no new fetch inside the 15 s window");
    now.set(11 * 60_000 + 16_000);
    await validateLicense(KEY, s);
    assert.equal(s.calls.length, 3);
  }
});

test("LS down: the grace ends after 24 hours", async () => {
  const now = clock(0);
  const s = { ...setup(ok(), new Error("fetch failed")), now };
  await validateLicense(KEY, s);
  now.set(24 * 3_600_000 + 1);
  const v = await validateLicense(KEY, s);
  assert.deepEqual(v, { valid: false, plan: null, reason: LS_DOWN });
});

test("LS down with no recent success fails closed with a sentence a voice can say", async () => {
  const v = await validateLicense(KEY, setup(new Error("fetch failed")));
  assert.equal(v.valid, false);
  assert.equal(v.reason, LS_DOWN);
});

test("LS saying no overrides the grace: a refunded key does not keep working", async () => {
  const now = clock(0);
  const s = { ...setup(ok(), { valid: false, license_key: { status: "disabled" } }, new Error("down")), now };
  await validateLicense(KEY, s);
  now.set(11 * 60_000);
  assert.equal((await validateLicense(KEY, s)).valid, false);
  now.set(22 * 60_000);
  assert.equal((await validateLicense(KEY, s)).valid, false);
});

test("licenseGate does nothing unless LICENSE_REQUIRED=1", async () => {
  const s = setup(ok());
  assert.equal(await licenseGate(withKey(), { ...s, env: {} }), null);
  assert.equal(await licenseGate(withKey("junk"), { ...s, env: { LICENSE_REQUIRED: "0" } }), null);
  assert.equal(s.calls.length, 0);
});

test("licenseGate answers 402 with a one-line reason and the pricing path when the header is missing", async () => {
  const s = setup(ok());
  const res = (await licenseGate(withKey(), s))!;
  assert.equal(res.status, 402);
  const j = (await res.json()) as { error: string; upgrade: string };
  assert.equal(j.upgrade, "/pricing");
  assert.match(j.error, /Pro license.*pricing page/);
  assert.equal(s.calls.length, 0, "no key, so no call to LS");
});

test("licenseGate lets a valid key through and 402s a bad one without echoing it", async () => {
  assert.equal(await licenseGate(withKey(KEY), setup(ok())), null);
  const res = (await licenseGate(withKey(KEY), setup(ok(meta({ store_id: 999 })))))!;
  assert.equal(res.status, 402);
  assert.ok(!JSON.stringify(await res.json()).includes(KEY));
});

test("licenseGate with LS down and no recent success is a 402 that says to try again, not to buy", async () => {
  const res = (await licenseGate(withKey(KEY), setup(503)))!;
  assert.equal(res.status, 402);
  assert.equal(((await res.json()) as { error: string }).error, LS_DOWN);
});

test("activate: our key is validated first, then activated, and the instance id comes back", async () => {
  const s = setup(ok({ license_key: { status: "inactive" } }), { ...ok(), activated: true, instance: { id: "inst-9" } });
  const r = await activateLicense(KEY, s);
  assert.deepEqual(r, { valid: true, plan: "pro", reason: "ok", instanceId: "inst-9" });
  assert.deepEqual(s.calls.map((c) => c.url.split("/").pop()), ["validate", "activate"]);
  assert.equal(String(s.calls[1].init.body), `license_key=${KEY}&instance_name=Terminal+1+web`);
});

test("activate: another store's key is refused before it is activated", async () => {
  const s = setup(ok(meta({ store_id: 999 })));
  assert.equal((await activateLicense(KEY, s)).valid, false);
  assert.equal(s.calls.length, 1);
});

test("activate: LS's own message comes back when the activation limit is reached", async () => {
  const s = setup(ok(), { activated: false, error: "This license key has reached the activation limit.", instance: null });
  const r = await activateLicense(KEY, s);
  assert.equal(r.valid, false);
  assert.match(r.reason, /activation limit/);
  assert.equal((await activateLicense(KEY, setup(new Error("down")))).reason, LS_DOWN);
});
