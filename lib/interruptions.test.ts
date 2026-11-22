// Run: node --test lib/interruptions.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { type Alert, type AlertState, checkAnswer, markAnswered } from "./alerts.ts";
import { DEFAULT_INTERRUPTIONS, type Interruptions, QUIET_MS, deferQueued, endQuiet, expire, goQuiet, nextSpoken, parseInterruptions, queuedAgents, sieve } from "./interruptions.ts";

let n = 0;
const alert = (from: string, req: string | null, state: AlertState, over: Partial<Alert> = {}): Alert =>
  ({ id: ++n, seq: n, from, login: "eithan", why: "blocked", text: "t", at: "", kind: req ? "approval" : "blocked", req, ctx: null, state, ...over });
const update = (from: string) => alert(from, null, "waiting", { why: "mention", kind: "done" });

const T0 = 1_000_000;
const quiet30 = goQuiet({ mode: "all" }, T0, QUIET_MS);

test("two blockers arriving during quiet stay queued and nothing speaks on its own", () => {
  const a = [alert("Eithan's Claude", "aaa111", "waiting"), alert("Maya's Claude", "bbb222", "waiting")];
  assert.equal(nextSpoken(a, quiet30, false), undefined);
  assert.equal(sieve(a, quiet30), a);
  assert.deepEqual(queuedAgents(a), ["Eithan's Claude", "Maya's Claude"]);
  assert.deepEqual(queuedAgents([...a, alert("Maya's Claude", "ccc333", "waiting")]), ["Eithan's Claude", "Maya's Claude"]);
});

test("updates that arrive during quiet go to the standup, not the queue", () => {
  const a = [update("Eithan's Claude"), alert("Maya's Claude", "bbb222", "waiting")];
  const after = sieve(a, quiet30);
  assert.deepEqual(after.map((x) => x.state), ["told", "waiting"]);
  assert.deepEqual(queuedAgents(after), ["Maya's Claude"]);
});

test("after quiet ends the previous mode is back, the offer holds speech, then blockers read one at a time", () => {
  const blockers: Interruptions = { mode: "blockers" };
  const q = goQuiet(blockers, T0, QUIET_MS);
  assert.deepEqual(expire(q, T0 + QUIET_MS - 1), q);
  const back = expire(q, T0 + QUIET_MS);
  assert.deepEqual(back, blockers);

  let a = [alert("Eithan's Claude", "aaa111", "waiting"), alert("Maya's Claude", "bbb222", "waiting")];
  assert.equal(nextSpoken(a, back, true), undefined, "the offer is open: nothing speaks yet");
  const first = nextSpoken(a, back, false);
  assert.equal(first?.req, "aaa111");
  a = a.map((x) => (x.req === "aaa111" ? { ...x, state: "playing" } : x));
  assert.equal(nextSpoken(a, back, false), undefined, "no overlap while the first is being handled");
  a = a.map((x) => (x.req === "aaa111" ? { ...x, state: "asking" } : x));
  assert.equal(nextSpoken(a, back, false), undefined);
  assert.match(checkAnswer(a, "bbb222") ?? "", /just asked about request aaa111/);
  a = markAnswered(a, new Set(["aaa111"]));
  assert.equal(nextSpoken(a, back, false)?.req, "bbb222");
});

test("Not now: held blockers stop waiting to be read but stay open for a hand answer", () => {
  const a = [alert("Eithan's Claude", "aaa111", "waiting"), alert("Maya's Claude", "bbb222", "answered")];
  const kept = deferQueued(a);
  assert.deepEqual(kept.map((x) => x.state), ["told", "answered"]);
  assert.equal(nextSpoken(kept, { mode: "all" }, false), undefined);
});

test("All updates reads updates; Blockers only skips them without blocking the blocker behind", () => {
  const a = () => [update("Eithan's Claude"), alert("Maya's Claude", "bbb222", "waiting")];
  assert.equal(nextSpoken(a(), { mode: "all" }, false)?.from, "Eithan's Claude");
  assert.equal(nextSpoken(a(), { mode: "blockers" }, false)?.req, "bbb222");
  const kept = sieve(a(), { mode: "blockers" });
  assert.equal(kept[0].state, "told");
  assert.equal(sieve(kept, { mode: "all" }), kept, "a later switch to All updates does not replay it");
});

test("quiet remembers the mode before it, ends on time or when turned off", () => {
  assert.deepEqual(quiet30, { mode: "dnd", quietUntil: T0 + QUIET_MS, previousMode: "all" });
  const again = goQuiet(goQuiet({ mode: "blockers" }, T0, null), T0 + 5, QUIET_MS);
  assert.deepEqual(again, { mode: "dnd", quietUntil: T0 + 5 + QUIET_MS, previousMode: "blockers" });
  const open = goQuiet({ mode: "blockers" }, T0, null);
  assert.equal(expire(open, T0 + 10 * QUIET_MS), open, "until I turn it off never expires");
  assert.deepEqual(endQuiet(open), { mode: "blockers" });
  assert.deepEqual(endQuiet({ mode: "all" }), { mode: "all" });
});

test("a saved setting is checked on the way in", () => {
  assert.deepEqual(parseInterruptions(null, T0), DEFAULT_INTERRUPTIONS);
  assert.deepEqual(parseInterruptions("not json", T0), DEFAULT_INTERRUPTIONS);
  assert.deepEqual(parseInterruptions('{"mode":"loud"}', T0), DEFAULT_INTERRUPTIONS);
  assert.deepEqual(parseInterruptions('{"mode":"blockers"}', T0), { mode: "blockers" });
  assert.deepEqual(parseInterruptions(JSON.stringify(quiet30), T0 + 1), quiet30);
  assert.deepEqual(parseInterruptions(JSON.stringify(quiet30), T0 + QUIET_MS), { mode: "all" }, "a quiet that ended while closed is over");
  assert.deepEqual(parseInterruptions('{"mode":"dnd","quietUntil":null,"previousMode":"nope"}', T0), { mode: "dnd", quietUntil: null, previousMode: "all" });
});
