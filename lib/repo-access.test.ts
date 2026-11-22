// Run: node --test lib/repo-access.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { assertReadable } from "./repo-access.ts";

function stubGithub(privateRepos: string[]) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const name = url.replace("https://api.github.com/repos/", "");
    return Response.json({ private: privateRepos.includes(name) });
  }) as typeof fetch;
  return calls;
}

test("public repos are readable without a sign-in, private ones are refused", async () => {
  stubGithub(["acme/secret"]);
  await assertReadable("acme/open", {}, 0);
  await assert.rejects(assertReadable("acme/secret", {}, 0), { status: 403, message: "Sign in with GitHub to use a private repo." });
});

test("the answer is cached for five minutes", async () => {
  const calls = stubGithub([]);
  await assertReadable("acme/cached", {}, 0);
  await assertReadable("ACME/cached", {}, 299_000);
  assert.equal(calls.length, 1);
  await assertReadable("acme/cached", {}, 301_000);
  assert.equal(calls.length, 2);
});

test("DEMO_REPOS and signed-in callers skip the check", async () => {
  const calls = stubGithub(["acme/demo", "acme/mine"]);
  process.env.DEMO_REPOS = "x/y, Acme/Demo";
  await assertReadable("acme/demo", {}, 0);
  await assertReadable("acme/mine", { signedIn: true }, 0);
  assert.equal(calls.length, 0);
  delete process.env.DEMO_REPOS;
});
