// Run: node --test lib/session.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { type Session, canWrite, cookieHeader, readCookie, seal, unseal } from "./session.ts";

const SECRET = "0123456789abcdef0123456789abcdef-test-secret";
const me: Session = { token: "gho_faketoken", login: "cheryl", name: "Cheryl Aurelia", avatar: "https://avatars.example/c.png" };

test("cookie round trip returns the session; nothing readable sits in the cookie", async () => {
  const cookie = await seal(me, SECRET);
  assert.deepEqual(await unseal(cookie, SECRET), me);
  assert.ok(!Buffer.from(cookie, "base64url").toString("latin1").includes("gho_faketoken"));
  assert.notEqual(cookie, await seal(me, SECRET), "fresh iv each time");
});

test("tampered, truncated, foreign and expired cookies are rejected", async () => {
  const cookie = await seal(me, SECRET, 1_000);
  const raw = Buffer.from(cookie, "base64url");
  for (const at of [0, 11, 12, raw.length - 1]) {
    const bad = Buffer.from(raw);
    bad[at] ^= 1;
    assert.equal(await unseal(bad.toString("base64url"), SECRET, 2_000), null, `flipped byte ${at}`);
  }
  assert.equal(await unseal(raw.subarray(0, raw.length - 1).toString("base64url"), SECRET, 2_000), null, "truncated");
  assert.equal(await unseal(cookie, `${SECRET}x`, 2_000), null, "wrong secret");
  assert.equal(await unseal("", SECRET), null);
  assert.equal(await unseal("not a cookie!!", SECRET), null);
  assert.deepEqual(await unseal(cookie, SECRET, 2_000), me, "still valid before expiry");
  assert.equal(await unseal(cookie, SECRET, 1_000 + 31 * 24 * 3600_000), null, "expired after 30 days");
});

test("cookie header is HttpOnly and Lax, and Secure in production", () => {
  const env = process.env as Record<string, string | undefined>;
  const was = env.NODE_ENV;
  env.NODE_ENV = "production";
  assert.match(cookieHeader("a", "b", 60), /^a=b; Path=\/; Max-Age=60; HttpOnly; SameSite=Lax; Secure$/);
  env.NODE_ENV = "development";
  assert.doesNotMatch(cookieHeader("a", "b", 60), /Secure/);
  env.NODE_ENV = was;
  const req = new Request("http://x", { headers: { cookie: "a=1; coworker_session=abc=; z=3" } });
  assert.equal(readCookie(req, "coworker_session"), "abc=");
  assert.equal(readCookie(req, "missing"), undefined);
});

test("write decision table", async () => {
  const lookups: string[] = [];
  const canPush = (push: boolean) => async (repo: string) => (lookups.push(repo), push);
  const who = (login: string) => ({ token: "t", login });
  const rows: [string, Parameters<typeof canWrite>[1], string | undefined, boolean, boolean][] = [
    // label, session, WRITE_REPOS, user can push, expected
    ["signed out, repo listed", null, "a/b, c/d", false, true],
    ["signed out, listed in other case", null, "A/B", false, true],
    ["signed out, repo not listed", null, "c/d", true, false],
    ["signed out, no list", null, undefined, true, false],
    ["signed out, empty list", null, " , ", true, false],
    ["signed in, can push, not listed", who("u1"), undefined, true, true],
    ["signed in, can push, listed", who("u2"), "a/b", true, true],
    ["signed in, cannot push, not listed", who("u3"), undefined, false, false],
    ["signed in, cannot push, listed", who("u4"), "a/b", false, false],
  ];
  for (const [label, session, writeRepos, push, want] of rows) {
    assert.equal(await canWrite("a/b", session, writeRepos, canPush(push)), want, label);
  }
  assert.equal(lookups.length, 4, "signed-out decisions never call GitHub");
});

test("push permission is cached for 60 s per user and repo, and failures are not cached", async () => {
  let calls = 0;
  let push = true;
  const lookup = async () => (calls++, push);
  const u = { token: "t", login: "cacheuser" };
  assert.equal(await canWrite("o/r", u, undefined, lookup, 0), true);
  push = false;
  assert.equal(await canWrite("O/R", u, undefined, lookup, 59_000), true, "served from cache");
  assert.equal(calls, 1);
  assert.equal(await canWrite("o/other", u, undefined, lookup, 59_000), false, "other repo looks up again");
  assert.equal(await canWrite("o/r", { ...u, login: "someone-else" }, undefined, lookup, 59_000), false, "other user looks up again");
  assert.equal(await canWrite("o/r", u, undefined, lookup, 61_000), false, "expired after 60 s");
  assert.equal(calls, 4);
  const boom = async () => {
    throw new Error("GitHub is down");
  };
  await assert.rejects(canWrite("o/err", u, undefined, boom, 0), /down/);
  assert.equal(await canWrite("o/err", u, undefined, async () => true, 1), true, "next call retries");
});
