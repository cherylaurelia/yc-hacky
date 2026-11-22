// Run: node --test lib/github.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { gh } from "./github.ts";

function authSeen(): { calls: (string | null)[] } {
  const calls: (string | null)[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(new Headers(init.headers).get("authorization"));
    return Response.json({});
  }) as typeof fetch;
  return { calls };
}

test("no token: reads use the OAuth app's client credentials, writes and tokens do not", async () => {
  process.env.GITHUB_CLIENT_ID = "id1";
  process.env.GITHUB_CLIENT_SECRET = "sec1";
  const { calls } = authSeen();
  await gh("/repos/a/b");
  await gh("/repos/a/b", { token: "tok" });
  await gh("/repos/a/b/issues", { method: "POST", body: { title: "x" } });
  assert.deepEqual(calls, [`Basic ${Buffer.from("id1:sec1").toString("base64")}`, "Bearer tok", null]);
});

test("no token and no OAuth app: anonymous", async () => {
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  const { calls } = authSeen();
  await gh("/repos/a/b");
  assert.deepEqual(calls, [null]);
});
