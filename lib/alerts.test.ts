// Run: node --test lib/alerts.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { type Alert, type AlertState, checkAnswer, current, findAlert, markAnswered, nextUp, waiting } from "./alerts.ts";

let n = 0;
const alert = (from: string, req: string | null, state: AlertState, over: Partial<Alert> = {}): Alert =>
  ({ id: ++n, seq: n, from, login: "eithan", why: "blocked", text: "t", at: "", kind: req ? "approval" : "blocked", req, ctx: null, state, ...over });

test("one alert at a time: the next waits until the current is answered", () => {
  const a = [alert("Eithan's Claude", "aaa111", "waiting"), alert("Maya's Claude", "bbb222", "waiting")];
  assert.equal(nextUp(a)?.req, "aaa111");
  a[0].state = "playing";
  assert.equal(nextUp(a), undefined);
  a[0].state = "asking";
  assert.equal(nextUp(a), undefined);
  assert.equal(current(a)?.req, "aaa111");
  const done = markAnswered(a, new Set(["aaa111"]));
  assert.equal(nextUp(done)?.req, "bbb222");
});

test("an answer is bound to the alert that was asked", () => {
  const a = [alert("Eithan's Claude", "aaa111", "asking"), alert("Maya's Claude", "bbb222", "waiting")];
  assert.match(checkAnswer(a, "bbb222") ?? "", /just asked about request aaa111/);
  assert.equal(checkAnswer(a, "aaa111"), null);
  const b = [alert("Eithan's Claude", "aaa111", "answered"), alert("Maya's Claude", "bbb222", "waiting")];
  assert.match(checkAnswer(b, "aaa111") ?? "", /already answered/);
  assert.match(checkAnswer(b, "bbb222") ?? "", /not asked about request bbb222/);
  assert.equal(checkAnswer([alert("x", "aaa111", "told")], "ccc333"), null);
});

test("waiting counts open blockers only", () => {
  const a = [alert("a", "111111", "answered"), alert("b", "222222", "waiting"), alert("c", null, "told"), alert("d", null, "told", { why: "mention" })];
  assert.deepEqual(waiting(a).map((x) => x.from), ["b", "c"]);
});

test("show me: by req, by agent name, else the most recent", () => {
  const a = [alert("Eithan's Claude", "aaa111", "told"), alert("Maya's Claude", "bbb222", "asking"), alert("Eithan's Claude", "ccc333", "waiting")];
  const req = (r: ReturnType<typeof findAlert>) => ("alert" in r ? r.alert.req : r.error);
  assert.equal(req(findAlert(a)), "ccc333");
  assert.equal(req(findAlert(a, "maya")), "bbb222");
  assert.equal(req(findAlert(a, "Eithan's Claude")), "ccc333");
  assert.equal(req(findAlert(a, "someone", "REQ aaa111")), "aaa111");
  assert.match(req(findAlert(a, "Zed")) ?? "", /no alert from Zed/);
  assert.match(req(findAlert([])) ?? "", /no alerts/);
});
