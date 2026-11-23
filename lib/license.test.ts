// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/license.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { INSTANCE_HEADER, LICENSE_HEADER, LS_DOWN, NEED_ACTIVATION, activateLicense, licenseGate, licenseRequired, newCache, validateLicense } from "./license.ts";
import { Limiter } from "./ratelimit.ts";

const env = { LICENSE_REQUIRED: "1", LEMONSQUEEZY_STORE_ID: "111", LEMONSQUEEZY_PRODUCT_IDS: "10, 20", LEMONSQUEEZY_TEAM_PRODUCT_IDS: "20" };
const KEY = "38b1460a-5104-4067-a91d-77b872934d51";
const INST = "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17";
const INST2 = "9d3c2b1e-6f4a-4c1d-8e7b-2a5f0c9d1e34";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// What LS answers to a validate that names this device's seat.
const ok = (over: object = {}) => ({
  valid: true,
  error: null,
  license_key: { status: "active" },
  instance: { id: INST },
  meta: { store_id: 111, product_id: 10, variant_name: "Pro Monthly" },
  ...over,
});
const meta = (over: object) => ({ meta: { store_id: 111, product_id: 10, variant_name: "Pro Monthly", ...over } });
// What LS answers to a validate with no instance, for a key nobody has activated yet.
const fresh = (over: object = {}) => ok({ license_key: { status: "inactive" }, instance: null, ...over });

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
const setup = (...replies: (object | number | Error)[]) => ({ ...stub(...replies), cache: newCache(), env });
const uncapped = () => ({ ...newCache(), calls: new Limiter(1e9) });
const withKey = (key?: string, instance?: string) =>
  new Request("http://x/api/speak", { headers: { ...(key ? { [LICENSE_HEADER]: key } : {}), ...(instance ? { [INSTANCE_HEADER]: instance } : {}) } });
const body = (c: { init: RequestInit }) => String(c.init.body);

test("a valid pro key on its own seat unlocks pro, and LS gets a form-encoded validate request naming the instance", async () => {
  const s = setup(ok());
  const v = await validateLicense(KEY, INST, s);
  assert.deepEqual(v, { valid: true, plan: "pro", reason: "ok" });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, "https://api.lemonsqueezy.com/v1/licenses/validate");
  assert.equal(s.calls[0].init.method, "POST");
  assert.equal((s.calls[0].init.headers as Record<string, string>).Accept, "application/json");
  assert.equal(body(s.calls[0]), `license_key=${KEY}&instance_id=${INST}`);
});

test("a key for the team product (or a Team variant) is the team plan", async () => {
  assert.equal((await validateLicense(KEY, INST, setup(ok(meta({ product_id: 20 })))).then((v) => v.plan)), "team");
  assert.equal((await validateLicense(KEY, INST, setup(ok(meta({ variant_name: "Team seat" })))).then((v) => v.plan)), "team");
});

test("a key from someone else's LS store is rejected", async () => {
  const v = await validateLicense(KEY, INST, setup(ok(meta({ store_id: 999 }))));
  assert.equal(v.valid, false);
  assert.equal(v.plan, null);
  assert.match(v.reason, /not for Terminal 1/);
});

test("a key for another product in our store is rejected", async () => {
  const v = await validateLicense(KEY, INST, setup(ok(meta({ product_id: 30 }))));
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
    const v = await validateLicense(KEY, INST, setup(ok({ license_key, valid })));
    assert.equal(v.valid, false);
    assert.match(v.reason, reason);
  }
  assert.equal((await validateLicense(KEY, INST, setup({ valid: false, error: "license_key not found." }))).valid, false);
});

test("a server with no store or products configured lets nothing through", async () => {
  const s = { ...setup(ok()), env: { LICENSE_REQUIRED: "1" } };
  assert.match((await validateLicense(KEY, INST, s)).reason, /not set up/);
});

test("seat enforcement: a key LS likes but that has no seat for this instance is not valid", async () => {
  // LS answers valid:true for the key, yet it does not know this instance (never activated, or the seat was removed).
  for (const instance of [null, { id: INST2 }, undefined]) {
    const v = await validateLicense(KEY, INST, setup(ok({ instance })));
    assert.deepEqual(v, { valid: false, plan: null, reason: NEED_ACTIVATION });
  }
});

test("a cached yes is per key and instance: another device with the same key asks LS itself", async () => {
  const s = setup(ok(), ok({ instance: null }));
  assert.equal((await validateLicense(KEY, INST, s)).valid, true);
  assert.equal((await validateLicense(KEY, INST, s)).valid, true);
  assert.equal(s.calls.length, 1);
  assert.equal((await validateLicense(KEY, INST2, s)).valid, false);
  assert.equal(s.calls.length, 2);
  assert.equal(body(s.calls[1]), `license_key=${KEY}&instance_id=${INST2}`);
});

test("a cached answer avoids a second fetch: ten minutes for valid, one for invalid", async () => {
  const now = clock(0);
  const good = { ...setup(ok()), now };
  await validateLicense(KEY, INST, good);
  now.set(9 * 60_000);
  await validateLicense(KEY, INST, good);
  assert.equal(good.calls.length, 1);
  now.set(10 * 60_000 + 1);
  await validateLicense(KEY, INST, good);
  assert.equal(good.calls.length, 2);

  const t = clock(0);
  const bad = { ...setup({ valid: false, error: "nope" }), now: t };
  await validateLicense(KEY, INST, bad);
  t.set(59_000);
  await validateLicense(KEY, INST, bad);
  assert.equal(bad.calls.length, 1);
  t.set(61_000);
  await validateLicense(KEY, INST, bad);
  assert.equal(bad.calls.length, 2);
});

test("abuse: a key that is not UUID-shaped is rejected with no call to LS", async () => {
  const s = setup(ok());
  for (const junk of ["junk", "k1", "38b1460a-5104-4067-a91d-77b872934d5", `${KEY}0`, "zzzzzzzz-5104-4067-a91d-77b872934d51", "a".repeat(500), "'; drop table--"]) {
    const v = await validateLicense(junk, INST, s);
    assert.deepEqual(v, { valid: false, plan: null, reason: "That license key is not valid." }, junk);
  }
  assert.equal(s.calls.length, 0);
  assert.equal(s.cache.bad.size, 0, "junk is not even remembered");
});

test("abuse: no instance id, or one that is not UUID-shaped, is 'activate' with no call to LS", async () => {
  const s = setup(ok());
  for (const inst of ["", "   ", "inst-1", "x".repeat(300)]) {
    assert.deepEqual(await validateLicense(KEY, inst, s), { valid: false, plan: null, reason: NEED_ACTIVATION });
  }
  assert.equal(s.calls.length, 0);
});

test("the cache of yes answers is capped, oldest first", async () => {
  const s = { ...setup(ok()), cache: uncapped() };
  for (let i = 0; i < 1005; i++) await validateLicense(uuid(i), INST, s);
  assert.equal(s.cache.ok.size, 1000);
  assert.equal(s.cache.ok.has(`${uuid(0)}:${INST}`), false);
  assert.equal(s.cache.ok.has(`${uuid(1004)}:${INST}`), true);
});

test("abuse: rejected keys live in their own small cache and cannot push a valid one out", async () => {
  const s = { ...setup(ok(), { valid: false, error: "license_key not found." }), cache: uncapped() };
  assert.equal((await validateLicense(KEY, INST, s)).valid, true);
  for (let i = 1; i <= 300; i++) await validateLicense(uuid(i), INST, s);
  assert.equal(s.cache.bad.size, 100);
  assert.equal(s.cache.ok.size, 1);
  const before = s.calls.length;
  assert.equal((await validateLicense(KEY, INST, s)).valid, true);
  assert.equal(s.calls.length, before, "the real key is still served from the cache");
});

test("LS down: a key that validated in the last day is still allowed, and LS is retried within 15 s", async () => {
  for (const down of [new Error("fetch failed"), 503, 429]) {
    const now = clock(0);
    const s = { ...setup(ok(), down), now };
    assert.equal((await validateLicense(KEY, INST, s)).valid, true);
    now.set(11 * 60_000);
    assert.deepEqual(await validateLicense(KEY, INST, s), { valid: true, plan: "pro", reason: "ok" });
    assert.equal(s.calls.length, 2);
    now.set(11 * 60_000 + 5_000);
    assert.equal((await validateLicense(KEY, INST, s)).valid, true);
    assert.equal(s.calls.length, 2, "no new fetch inside the 15 s window");
    now.set(11 * 60_000 + 16_000);
    await validateLicense(KEY, INST, s);
    assert.equal(s.calls.length, 3);
  }
});

test("LS down: the grace ends after 24 hours", async () => {
  const now = clock(0);
  const s = { ...setup(ok(), new Error("fetch failed")), now };
  await validateLicense(KEY, INST, s);
  now.set(24 * 3_600_000 + 1);
  const v = await validateLicense(KEY, INST, s);
  assert.deepEqual(v, { valid: false, plan: null, reason: LS_DOWN });
});

test("LS down with no recent success fails closed with a sentence a voice can say", async () => {
  const v = await validateLicense(KEY, INST, setup(new Error("fetch failed")));
  assert.equal(v.valid, false);
  assert.equal(v.reason, LS_DOWN);
});

test("LS saying no overrides the grace: a refunded key does not keep working", async () => {
  const now = clock(0);
  const s = { ...setup(ok(), { valid: false, license_key: { status: "disabled" } }, new Error("down")), now };
  await validateLicense(KEY, INST, s);
  now.set(11 * 60_000);
  assert.equal((await validateLicense(KEY, INST, s)).valid, false);
  now.set(22 * 60_000);
  assert.equal((await validateLicense(KEY, INST, s)).valid, false);
});

test("abuse: past 50 calls to LS a minute, a key with a recent yes keeps its grace and others are told to try again", async () => {
  const now = clock(0);
  const s = { ...setup(ok(), { valid: false, error: "license_key not found." }), now };
  assert.equal((await validateLicense(KEY, INST, s)).valid, true);
  now.set(11 * 60_000); // KEY's cached yes has expired, and the minute's allowance is full again: 50 junk keys use it up
  for (let i = 1; i <= 50; i++) await validateLicense(uuid(i), INST, s);
  assert.equal(s.calls.length, 51);

  assert.deepEqual(await validateLicense(uuid(500), INST, s), { valid: false, plan: null, reason: LS_DOWN });
  assert.equal(s.calls.length, 51, "the 51st in that minute never reached LS");
  assert.deepEqual(await validateLicense(KEY, INST, s), { valid: true, plan: "pro", reason: "ok" });
  assert.equal(s.calls.length, 51, "the known-good key rode its grace instead of calling LS");

  now.set(11 * 60_000 + 61_000);
  await validateLicense(uuid(500), INST, s);
  assert.equal(s.calls.length, 52, "a minute later LS is asked again");
});

test("abuse: the call cap counts activations too, and the answer says to try again", async () => {
  const s = setup(fresh(), { activated: true, instance: { id: INST } });
  s.cache.calls = new Limiter(2);
  assert.equal((await activateLicense(KEY, undefined, s)).instanceId, INST);
  assert.equal(s.calls.length, 2);
  const r = await activateLicense(uuid(7), undefined, s);
  assert.deepEqual(r, { valid: false, plan: null, reason: LS_DOWN });
  assert.equal(s.calls.length, 2);
});

test("licenseRequired: on with LICENSE_REQUIRED=1, or a store id unless LICENSE_REQUIRED=0; off otherwise", () => {
  assert.equal(licenseRequired({}), false);
  assert.equal(licenseRequired({ LICENSE_REQUIRED: "1" }), true);
  assert.equal(licenseRequired({ LICENSE_REQUIRED: "1", LEMONSQUEEZY_STORE_ID: "111" }), true);
  assert.equal(licenseRequired({ LEMONSQUEEZY_STORE_ID: "111" }), true);
  assert.equal(licenseRequired({ LEMONSQUEEZY_STORE_ID: "111", LICENSE_REQUIRED: "" }), true);
  assert.equal(licenseRequired({ LEMONSQUEEZY_STORE_ID: "111", LICENSE_REQUIRED: "0" }), false);
  assert.equal(licenseRequired({ LEMONSQUEEZY_STORE_ID: "  " }), false);
  assert.equal(licenseRequired({ LICENSE_REQUIRED: "0" }), false);
  assert.equal(licenseRequired({ LICENSE_REQUIRED: "true" }), false, "only 1 turns it on by itself");
});

test("licenseGate does nothing with no store id and LICENSE_REQUIRED unset, or with LICENSE_REQUIRED=0", async () => {
  const s = setup(ok());
  assert.equal(await licenseGate(withKey(), { ...s, env: {} }), null);
  assert.equal(await licenseGate(withKey("junk"), { ...s, env: { LICENSE_REQUIRED: "0" } }), null);
  assert.equal(await licenseGate(withKey(), { ...s, env: { ...env, LICENSE_REQUIRED: "0" } }), null);
  assert.equal(s.calls.length, 0);
});

test("licenseGate is on as soon as a store id is configured, even with LICENSE_REQUIRED unset", async () => {
  const s = { ...setup(ok()), env: { ...env, LICENSE_REQUIRED: undefined } };
  assert.equal((await licenseGate(withKey(), s))!.status, 402);
  assert.equal(await licenseGate(withKey(KEY, INST), s), null);
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

test("licenseGate: a key alone does not unlock; it 402s with a sentence about activating, and LS is not called", async () => {
  const s = setup(ok());
  const res = (await licenseGate(withKey(KEY), s))!;
  assert.equal(res.status, 402);
  assert.equal(((await res.json()) as { error: string }).error, NEED_ACTIVATION);
  assert.match(NEED_ACTIVATION, /activate/i);
  assert.equal(s.calls.length, 0);
});

test("licenseGate lets a key on its own seat through, asking LS about that instance, and 402s a bad one without echoing it", async () => {
  const s = setup(ok());
  assert.equal(await licenseGate(withKey(KEY, INST), s), null);
  assert.equal(body(s.calls[0]), `license_key=${KEY}&instance_id=${INST}`);
  const res = (await licenseGate(withKey(KEY, INST), setup(ok(meta({ store_id: 999 })))))!;
  assert.equal(res.status, 402);
  assert.ok(!JSON.stringify(await res.json()).includes(KEY));
});

test("licenseGate: someone else's instance id with a leaked key is a 402 that says to activate", async () => {
  const res = (await licenseGate(withKey(KEY, INST2), setup(ok({ instance: null }))))!;
  assert.equal(res.status, 402);
  assert.equal(((await res.json()) as { error: string }).error, NEED_ACTIVATION);
});

test("licenseGate with a made-up key is a 402 and costs no call to LS", async () => {
  const s = setup(ok());
  assert.equal((await licenseGate(withKey("not-a-key", INST), s))!.status, 402);
  assert.equal(s.calls.length, 0);
});

test("licenseGate with LS down and no recent success is a 402 that says to try again, not to buy", async () => {
  const res = (await licenseGate(withKey(KEY, INST), setup(503)))!;
  assert.equal(res.status, 402);
  assert.equal(((await res.json()) as { error: string }).error, LS_DOWN);
});

test("activate: our key is validated first, then activated, and the instance id comes back", async () => {
  const s = setup(fresh(), { ...ok(), activated: true, instance: { id: INST2 } });
  const r = await activateLicense(KEY, undefined, s);
  assert.deepEqual(r, { valid: true, plan: "pro", reason: "ok", instanceId: INST2 });
  assert.deepEqual(s.calls.map((c) => c.url.split("/").pop()), ["validate", "activate"]);
  assert.equal(body(s.calls[0]), `license_key=${KEY}`);
  assert.equal(body(s.calls[1]), `license_key=${KEY}&instance_name=Terminal+1+web`);
});

test("activate: a device that already holds a seat gets it back and no second seat is activated", async () => {
  const s = setup(ok());
  const r = await activateLicense(KEY, INST, s);
  assert.deepEqual(r, { valid: true, plan: "pro", reason: "ok", instanceId: INST });
  assert.deepEqual(s.calls.map((c) => c.url.split("/").pop()), ["validate"]);
  assert.equal(body(s.calls[0]), `license_key=${KEY}&instance_id=${INST}`);
});

test("activate: an instance id LS no longer honours is not reused; the device activates a new seat", async () => {
  const s = setup(ok({ instance: null }), fresh(), { activated: true, instance: { id: INST2 } });
  const r = await activateLicense(KEY, INST, s);
  assert.deepEqual(r, { valid: true, plan: "pro", reason: "ok", instanceId: INST2 });
  assert.deepEqual(s.calls.map((c) => c.url.split("/").pop()), ["validate", "validate", "activate"]);
});

test("activate: with LS down, an existing seat is not answered by trying to activate another", async () => {
  const s = setup(new Error("down"));
  assert.deepEqual(await activateLicense(KEY, INST, s), { valid: false, plan: null, reason: LS_DOWN });
  assert.equal(s.calls.length, 1);
});

test("activate: a key that is not UUID-shaped is refused with no call to LS", async () => {
  const s = setup(fresh());
  assert.deepEqual(await activateLicense("junk", undefined, s), { valid: false, plan: null, reason: "That license key is not valid." });
  assert.equal((await activateLicense("junk", INST, s)).valid, false);
  assert.equal(s.calls.length, 0);
});

test("activate: another store's key is refused before it is activated", async () => {
  const s = setup(fresh(meta({ store_id: 999 })));
  assert.equal((await activateLicense(KEY, undefined, s)).valid, false);
  assert.equal(s.calls.length, 1);
});

test("activate: LS's own message comes back when the activation limit is reached", async () => {
  const s = setup(fresh(), { activated: false, error: "This license key has reached the activation limit.", instance: null });
  const r = await activateLicense(KEY, undefined, s);
  assert.equal(r.valid, false);
  assert.match(r.reason, /activation limit/);
  assert.equal((await activateLicense(KEY, undefined, setup(new Error("down")))).reason, LS_DOWN);
});
