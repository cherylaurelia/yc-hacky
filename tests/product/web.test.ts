// Web app and server product checks.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { ROOT } from "./helpers.ts";

const run = promisify(execFile);
const mod = async (rel: string) => {
  const f = join(ROOT, rel);
  assert.ok(existsSync(f), `missing ${rel}`);
  return import(f);
};

test("web: a cookie-carrying write with no Origin is refused (CSRF)", async () => {
  const { sameOrigin } = await mod("lib/origin.ts");
  const req = (h: Record<string, string>) => new Request("https://cw.example/api/tool/answer_request", { method: "POST", headers: { host: "cw.example", ...h } });
  assert.equal(sameOrigin(req({ cookie: "cw_session=abc" })), false, "cookie and no Origin");
  assert.equal(sameOrigin(req({ cookie: "cw_session=abc", "sec-fetch-site": "same-origin" })), true, "browser says same-origin");
  assert.equal(sameOrigin(req({ cookie: "cw_session=abc", origin: "https://cw.example" })), true, "same Origin");
  assert.equal(sameOrigin(req({ cookie: "cw_session=abc", origin: "https://evil.example" })), false, "other Origin");
  assert.equal(sameOrigin(req({})), true, "no cookie, nothing to forge");
  assert.match(readFileSync(join(ROOT, "lib/auth.ts"), "utf8"), /origin(\.ts)?["']/, "lib/auth.ts uses lib/origin");
});

test("web: /api/health answers for monitors", async () => {
  const { GET } = await mod("app/api/health/route.ts");
  const res: Response = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("web: the server mints single-use Scribe tokens for signed-in users", async () => {
  const { scribeTokenRequest } = await mod("lib/scribe-token.ts");
  const { url, init } = scribeTokenRequest("xi_test_key");
  assert.equal(url, "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
  assert.equal(init.method, "POST");
  assert.equal(new Headers(init.headers).get("xi-api-key"), "xi_test_key");
  const route = join(ROOT, "app/api/scribe-token/route.ts");
  assert.ok(existsSync(route), "missing app/api/scribe-token/route.ts");
  const src = readFileSync(route, "utf8");
  assert.match(src, /scribeTokenRequest/);
  assert.match(src, /sessionFrom|resolveToken/, "the route checks who is asking");
});

test("web: the page takes relay events from the Mac app and sends answers back", async () => {
  const { alertFromRelay, answerMessage } = await mod("lib/relay-bridge.ts");
  const a = alertFromRelay({ id: "e7", agent: "Sam's Codex", kind: "approval", text: "npm run migrate" });
  assert.equal(a.from, "Sam's Codex");
  assert.equal(a.req, "e7");
  assert.equal(a.why, "blocked", "approvals wait for an answer");
  assert.equal(a.kind, "approval");
  assert.match(a.text, /npm run migrate/);
  assert.notEqual(alertFromRelay({ id: "e8", agent: "x", kind: "done", text: "built" }).why, "blocked", "done needs no answer");
  assert.deepEqual(answerMessage("e7", "allow"), { answer: { id: "e7", text: "allow" } });
  const withCtx = alertFromRelay({ id: "e9", agent: "Sam's Claude", kind: "approval", text: "Bash npm run migrate", command: "npm run migrate", file: "db/schema.sql", diff: "+x" });
  assert.equal(withCtx.ctx?.command, "npm run migrate", "'show me' gets the command from the relay event");
  assert.equal(withCtx.ctx?.diff, "+x");
  assert.match(readFileSync(join(ROOT, "components/useCoworker.ts"), "utf8"), /coworker-relay/, "useCoworker listens for coworker-relay events");
});

test("web: a spoken verdict is never replaced by its note, except for questions", async () => {
  const { relayAnswerText } = await mod("lib/relay-bridge.ts");
  assert.equal(relayAnswerText("approval", "deny", "only approve after tests pass"), "deny");
  assert.equal(relayAnswerText("stuck", "stop", "it keeps looping"), "stop");
  assert.equal(relayAnswerText("blocked", "allow", "use 202"), "use 202", "a question's answer is the note");
  assert.equal(relayAnswerText("blocked", "allow", ""), "allow");
  assert.match(readFileSync(join(ROOT, "components/useCoworker.ts"), "utf8"), /relayAnswerText\(/, "useCoworker uses it");
});

test("web: lint has no errors", async () => {
  let out = "";
  try {
    out = (await run("npx", ["eslint", ".", "-f", "json"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, timeout: 180_000 })).stdout;
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? "";
  }
  const files = JSON.parse(out || "[]") as { filePath: string; errorCount: number }[];
  const bad = files.filter((f) => f.errorCount > 0).map((f) => `${f.filePath.replace(ROOT + "/", "")}: ${f.errorCount}`);
  assert.deepEqual(bad, []);
});
