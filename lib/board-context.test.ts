// Run: node --test lib/board-context.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { type Comment, alertMessage, alertsFrom, answeredFrom, parseContext, parsePost } from "./board.ts";
import { aloud } from "./spoken.ts";

let id = 100;
const post = (body: string): Comment => ({ id: ++id, user: { login: "cheryl" }, body, created_at: new Date().toISOString() });
const parse = (bodies: string[]) => bodies.map((b) => parsePost(post(b), "cherylaurelia"));
const block = (o: unknown) => `<!-- coworker:${JSON.stringify(o)} -->`;

test("context block: parsed, carried on the alert, never read as words", () => {
  const diff = "--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n-old @all blocked\n+new";
  const ctx = { v: 1, kind: "approval", req: "AB12CD", agent: "Eithan's Claude", cwd: "/tmp/r", tool: "Edit", command: "npm test", file: "x.ts", line: 3, diff, stuck: null };
  const [a] = alertsFrom(parse([`[Eithan's Claude] needs approval (req ab12cd): Edit x.ts ${block(ctx)}`]));
  assert.equal(a.kind, "approval");
  assert.equal(a.req, "ab12cd");
  assert.deepEqual([a.ctx?.command, a.ctx?.file, a.ctx?.line, a.ctx?.diff], ["npm test", "x.ts", 3, diff]);
  assert.equal(a.text, "needs approval (req ab12cd): Edit x.ts");
  // "@all" and "blocked" inside the diff must not alert a done post
  assert.deepEqual(alertsFrom(parse([`[Eithan's Claude] done: shipped ${block({ v: 1, kind: "done", diff })}`])), []);
});

test("stuck post is an alert with chips data; req comes from the text when there is no block", () => {
  const stuck = { count: 6, minutes: 20, cost_usd: 8, signature: "npm test" };
  const [a] = alertsFrom(parse([`[Eithan's Claude] stuck: retried npm test 6 times in 20 min, about $8 so far (req ab12cd) ${block({ v: 1, kind: "stuck", req: "ab12cd", stuck })}`]));
  assert.deepEqual([a.why, a.kind, a.ctx?.stuck], ["blocked", "stuck", stuck]);
  const [b] = alertsFrom(parse(["[Eithan's Claude] stuck: retried npm test 6 times in 20 min (req ab12cd)"]));
  assert.deepEqual([b.kind, b.req, b.ctx], ["stuck", "ab12cd", null]);
  assert.match(alertMessage([a]), /Retried 6 times over 20 minutes, about 8 dollars\./);
});

test("missing, broken and foreign context blocks are tolerated", () => {
  for (const body of ["no block here", "<!-- coworker:{not json} -->", "<!-- coworker:[1,2] -->", `<!-- coworker:{"v":2,"kind":"stuck"} -->`, "<!-- other:{} -->"]) {
    assert.equal(parseContext(body), null, body);
  }
  const bad = parseContext(`<!-- coworker:{"kind":"nope","line":-4,"req":"zz","stuck":{"count":"x"}} -->`);
  assert.deepEqual([bad?.kind, bad?.req, bad?.line, bad?.stuck], [undefined, undefined, undefined, undefined]);
  assert.equal(parsePost(post("[Sam's Claude] blocked: which db? <!-- coworker:{oops -->"), null).blocked, true);
});

test("answeredFrom finds replies, not requests", () => {
  const cs = [
    post("[cherylaurelia's Coworker] req AB12CD stop"),
    post("req 3fa9c1 allow"),
    post("[Sam's Claude] needs approval (req 99aa11): run req 99aa11 no"),
    post("[Cheryl's Coworker] @EithanY-Coder req 0000ff deny too risky"),
    post("[Cheryl's Coworker] sent: use 202"),
    post("[Eithan's Claude] req 7c01de closed: answered in the terminal"),
  ];
  assert.deepEqual(answeredFrom(cs), ["ab12cd", "3fa9c1", "0000ff", "7c01de"]);
});

test("a spoken post never says its request id", () => {
  assert.equal(aloud("needs approval (req c52c31): Bash npm run migrate in demo"), "needs approval: Bash npm run migrate in demo");
  assert.equal(aloud("stuck: retried npm test 3 times (req ab12cd)"), "stuck: retried npm test 3 times");
});

test("headline plays only the first sentence, without the req id", async () => {
  const { headline } = await import("./spoken.ts");
  assert.equal(headline("needs approval (req c52c31): Bash npm run migrate. It edits db/schema.sql first."), "needs approval: Bash npm run migrate.");
  assert.equal(headline("no period here"), "no period here");
});
