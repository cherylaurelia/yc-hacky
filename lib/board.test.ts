// Run: node --test lib/board.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { type Comment, alertMessage, alertsFrom, digest, parsePost } from "./board.ts";

let id = 0;
const post = (body: string, minsAgo = 5, login = "cheryl"): Comment => ({ id: ++id, user: { login }, body, created_at: new Date(Date.now() - minsAgo * 60_000).toISOString() });
const parse = (bodies: [string, number?][]) => bodies.map(([b, m]) => parsePost(post(b, m), "cherylaurelia"));

test("alerts on mention, @all, blocked and approval, not on progress or CI waits", () => {
  const posts = parse([
    ["[Aidan's Claude] login page merged, no action needed"],
    ["[Eithan's Codex] @cherylaurelia blocked: should the call API return 202 or 200?"],
    ["[Maya's Claude] @all heads up, schema changes at 3"],
    ["[Sam's Codex] needs approval to run the migration"],
    ["[Sam's Codex] pushed, waiting on CI"],
    ["[Ana's Claude] unblocked, carrying on"],
    ["[cherylaurelia's Coworker] @EithanY-Coder use 202, not blocked"],
    ["@cherylauraelia typo is not a mention"],
  ]);
  const got = alertsFrom(posts).map((a) => [a.from, a.why]);
  assert.deepEqual(got, [["Eithan's Codex", "blocked"], ["Maya's Claude", "mention"], ["Sam's Codex", "blocked"]]);
});

test("digest groups by agent, leads with asks, stays under 1200 chars", () => {
  const out = digest(parse([["[Aidan's Claude] login page merged", 50], ["[Eithan's Codex] @cherylaurelia blocked: 202 or 200?", 4], ["[Maya's Claude] waiting for approval to drop the table", 9]]), 60, "cherylaurelia");
  assert.match(out, /^In the last 60 minutes, 3 agents posted 3 times\. Mentioning you: Eithan's Codex, 4 minutes ago: blocked: 202 or 200\?/);
  assert.match(out, /Blocked or waiting: Maya's Claude/);
  assert.match(out, /Aidan's Claude, 1 post, latest: login page merged/);

  const many = digest(parse(Array.from({ length: 80 }, (_, i) => [`[Agent ${i}] shipped part ${i} of the long running refactor, touching many files`, 3] as [string, number])), 60, "cherylaurelia");
  assert.ok(many.length <= 1200 && /Plus \d+ more agents\.$/.test(many), many.slice(-80));
});

test("empty window and alert message", () => {
  assert.match(digest([], 90, "x"), /quiet for the last 90 minutes/);
  const [a] = alertsFrom(parse([["[Eithan's Codex] @cherylaurelia blocked: 202 or 200?"]]));
  assert.equal(alertMessage([a]), `[BOARD ALERT] Eithan's Codex (GitHub login cheryl) is blocked or waiting: "blocked: 202 or 200?"`);
});
