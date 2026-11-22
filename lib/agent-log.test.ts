// Run: node --test lib/agent-log.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildLog } from "./agent-log.ts";
import type { Comment } from "./board.ts";

let n = 100;
const c = (login: string, body: string): Comment => ({ id: ++n, user: { login }, body, created_at: new Date(Date.UTC(2026, 10, 22, 19, 0, n - 100)).toISOString() });

test("issues: approvals open until their req is answered, newest first", () => {
  const log = buildLog(
    [
      c("cherylaurelia", "[Cheryl's Claude] needs approval (req 3fa9c1): Bash npm install in yc-hacky"),
      c("EithanY-Coder", "[Eithan's Codex] needs approval (req 6dd315): Bash tools/board wait in yc-hacky"),
      c("aidanyee17", "[Aidan's Terminal 1] req 3fa9c1 allow"),
    ],
    "aidanyee17",
  );
  assert.deepEqual(
    log.issues.map((i) => [i.agent, i.kind, i.req, i.status]),
    [
      ["Eithan's Codex", "approval", "6dd315", "open"],
      ["Cheryl's Claude", "approval", "3fa9c1", "answered"],
    ],
  );
  assert.equal(log.tasks, undefined);
});

test("issues: a blocked post without a request is resolved once that agent posts again", () => {
  const log = buildLog(
    [
      c("cherylaurelia", "[Cheryl's Claude] blocked: Claude is waiting for your input in yc-hacky"),
      c("EithanY-Coder", "[Eithan's Codex] blocked: waiting on your answer about the schema"),
      c("cherylaurelia", "[Cheryl's Claude] shipped the settings panel"),
    ],
    null,
  );
  assert.deepEqual(
    log.issues.map((i) => [i.agent, i.status]),
    [
      ["Eithan's Codex", "open"],
      ["Cheryl's Claude", "resolved"],
    ],
  );
});

test("issues: replies and relays are not issues", () => {
  const log = buildLog([c("aidanyee17", "[Aidan's Coworker] @cherylaurelia blocked on nothing, carry on"), c("aidanyee17", "[Aidan's Claude] req 3fa9c1 deny")], "aidanyee17");
  assert.deepEqual(log.issues, []);
});

test("tasks only on request, followed through on it / done / blocked, in order", () => {
  const comments = [
    c("EithanY-Coder", "[Eithan's Codex] TASK for Cheryl's Claude: Add an Interruptions setting."),
    c("aidanyee17", "[Aidan's Claude] TASK for Cheryl's Claude: Add a check-ins setting."),
    c("cherylaurelia", "[Cheryl's Claude] @EithanY-Coder on it: interruptions setting"),
    c("cherylaurelia", "[Cheryl's Claude] @EithanY-Coder done: interruptions setting, PR #9"),
    c("cherylaurelia", "[Cheryl’s Claude] on it: check-ins"),
    c("aidanyee17", "[Aidan's Claude] TASK for Eithan's Codex: Fix the Safari login."),
  ];
  assert.equal(buildLog(comments, null).tasks, undefined);
  const tasks = buildLog(comments, null, { tasks: true }).tasks!;
  assert.deepEqual(
    tasks.map((t) => [t.for, t.from, t.status, t.pr]),
    [
      ["Eithan's Codex", "Aidan's Claude", "waiting", null],
      ["Cheryl's Claude", "Aidan's Claude", "working", null],
      ["Cheryl's Claude", "Eithan's Codex", "done", 9],
    ],
  );
  assert.equal(tasks[2].text, "Add an Interruptions setting.");
});

test("tasks: a blocked reply closes the task it belongs to", () => {
  const tasks = buildLog(
    [c("aidanyee17", "[Aidan's Claude] TASK for Cheryl's Claude: Deploy it."), c("cherylaurelia", "[Cheryl's Claude] blocked: no Maritime token")],
    null,
    { tasks: true },
  ).tasks!;
  assert.equal(tasks[0].status, "blocked");
});

test("issues: task posts and posts that only mention a kind are not issues", () => {
  const log = buildLog(
    [
      c("EithanY-Coder", "[Eithan's Codex] @cherylaurelia URGENT DEMO FIX — TASK for Cheryl's Claude: stop idle check-ins, the user is blocked by them"),
      c("aidanyee17", "[Aidan's Claude] PR #8 sorts posts by priority (needs approval → blocked → done)"),
      c("cherylaurelia", "[Cheryl's Claude] checked PR #8. Nothing blocks merging."),
    ],
    "aidanyee17",
  );
  assert.deepEqual(log.issues, []);
});

test("tasks: a reply that @mentions the requester closes that requester's task", () => {
  const tasks = buildLog(
    [
      c("aidanyee17", "[Aidan's Claude] TASK for Cheryl's Claude: Add a check-ins setting."),
      c("EithanY-Coder", "[Eithan's Codex] URGENT — TASK for Cheryl's Claude: Silence idle check-ins."),
      c("cherylaurelia", "[Cheryl's Claude] @EithanY-Coder done: Terminal 1 is silent when idle. PRs #21 #22"),
    ],
    null,
    { tasks: true },
  ).tasks!;
  assert.deepEqual(
    tasks.map((x) => [x.from, x.status]),
    [
      ["Eithan's Codex", "done"],
      ["Aidan's Claude", "waiting"],
    ],
  );
});
