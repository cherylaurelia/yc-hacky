// The voice coworker acts, not only reads: GitHub write tools (checked against the exact REST calls) and agent tools.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const load = async (rel: string) => {
  assert.ok(existsSync(join(ROOT, rel)), `missing ${rel}`);
  return import(join(ROOT, rel));
};

type Call = { method: string; path: string; body: Record<string, unknown> | null };

// Swaps global fetch for one that records GitHub calls and answers from `routes` ("METHOD /path" -> [status, json]).
function fakeGitHub(routes: Record<string, [number, unknown]>) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const hit = routes[`${method} ${url.pathname}`] ?? [404, { message: "Not Found" }];
    return new Response(JSON.stringify(hit[1]), { status: hit[0], headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; }, find: (m: string, p: string) => calls.find((c) => c.method === m && c.path === p) };
}

const CTX = { repo: "acme/widgets", token: "gho_test" };

async function call(name: string, args: Record<string, unknown>, routes: Record<string, [number, unknown]>) {
  const { HANDLERS, validateArgs } = await load("lib/tools.ts");
  assert.ok(HANDLERS[name], `no handler for ${name}`);
  const v = validateArgs(name, args);
  assert.ok(v.ok, `args rejected: ${v.error}`);
  const gh = fakeGitHub(routes);
  try {
    const out: string = await HANDLERS[name](CTX, v.args);
    return { out, gh };
  } finally {
    gh.restore();
  }
}

const WRITES = ["create_issue", "comment", "set_state", "create_pr", "merge_pr", "review_pr", "update_item"];
const AGENTS = ["start_agent", "list_agents", "stop_agent"];

test("actions: the voice agent has GitHub write tools and agent tools", async () => {
  const { TOOL_SPECS } = await load("lib/tool-specs.ts");
  const by = new Map(TOOL_SPECS.map((s: { name: string }) => [s.name, s]));
  for (const n of WRITES) {
    const s = by.get(n) as { write?: boolean; description?: string } | undefined;
    assert.ok(s, `missing tool ${n}`);
    assert.equal(s.write, true, `${n} must be a write tool (sign-in and push access checked)`);
    assert.match(s.description ?? "", /WRITE ACTION/, `${n} must tell the agent to confirm first`);
  }
  for (const n of AGENTS) {
    const s = by.get(n) as { local?: boolean } | undefined;
    assert.ok(s, `missing tool ${n}`);
    assert.equal(s.local, true, `${n} runs in the page (the Mac app starts agents on this machine)`);
  }
});

test("actions: create_issue opens an issue and says its number", async () => {
  const { out, gh } = await call("create_issue", { title: "Login breaks on Safari", body: "Steps: open /login" }, { "POST /repos/acme/widgets/issues": [201, { number: 42, html_url: "https://github.com/acme/widgets/issues/42" }] });
  const c = gh.find("POST", "/repos/acme/widgets/issues");
  assert.ok(c, "POST /repos/acme/widgets/issues");
  assert.equal(c.body?.title, "Login breaks on Safari");
  assert.equal(c.body?.body, "Steps: open /login");
  assert.match(out, /42/);
  assert.doesNotMatch(out, /https?:\/\//, "spoken text has no URLs");
});

test("actions: comment posts on an issue or pull request", async () => {
  const { gh } = await call("comment", { number: 7, text: "Fixed in main" }, { "POST /repos/acme/widgets/issues/7/comments": [201, { id: 1 }] });
  assert.equal(gh.find("POST", "/repos/acme/widgets/issues/7/comments")?.body?.body, "Fixed in main");
});

test("actions: set_state closes and reopens", async () => {
  let r = await call("set_state", { number: 7, state: "closed" }, { "PATCH /repos/acme/widgets/issues/7": [200, { number: 7, state: "closed" }] });
  assert.equal(r.gh.find("PATCH", "/repos/acme/widgets/issues/7")?.body?.state, "closed");
  r = await call("set_state", { number: 7, state: "open" }, { "PATCH /repos/acme/widgets/issues/7": [200, { number: 7, state: "open" }] });
  assert.equal(r.gh.find("PATCH", "/repos/acme/widgets/issues/7")?.body?.state, "open");
});

test("actions: create_pr opens a pull request against the default branch", async () => {
  const { out, gh } = await call("create_pr", { head: "fix-login", title: "Fix login on Safari" }, {
    "GET /repos/acme/widgets": [200, { default_branch: "trunk" }],
    "POST /repos/acme/widgets/pulls": [201, { number: 51, html_url: "https://github.com/acme/widgets/pull/51" }],
  });
  const c = gh.find("POST", "/repos/acme/widgets/pulls");
  assert.ok(c, "POST /repos/acme/widgets/pulls");
  assert.equal(c.body?.head, "fix-login");
  assert.equal(c.body?.base, "trunk", "base defaults to the repo's default branch");
  assert.equal(c.body?.title, "Fix login on Safari");
  assert.match(out, /51/);
});

test("actions: merge_pr squashes by default and explains a refusal", async () => {
  const { gh } = await call("merge_pr", { number: 9 }, { "PUT /repos/acme/widgets/pulls/9/merge": [200, { merged: true, sha: "abc" }] });
  assert.equal(gh.find("PUT", "/repos/acme/widgets/pulls/9/merge")?.body?.merge_method, "squash");
  await assert.rejects(
    call("merge_pr", { number: 9 }, { "PUT /repos/acme/widgets/pulls/9/merge": [405, { message: "Pull Request is not mergeable" }] }),
    (e: Error) => /merge/i.test(e.message) && !/\{/.test(e.message),
    "a refused merge is a spoken sentence, not raw JSON",
  );
});

test("actions: review_pr approves or requests changes", async () => {
  let r = await call("review_pr", { number: 9, verdict: "approve" }, { "POST /repos/acme/widgets/pulls/9/reviews": [200, { id: 3 }] });
  assert.equal(r.gh.find("POST", "/repos/acme/widgets/pulls/9/reviews")?.body?.event, "APPROVE");
  r = await call("review_pr", { number: 9, verdict: "request_changes", text: "Add a test" }, { "POST /repos/acme/widgets/pulls/9/reviews": [200, { id: 4 }] });
  const c = r.gh.find("POST", "/repos/acme/widgets/pulls/9/reviews");
  assert.equal(c?.body?.event, "REQUEST_CHANGES");
  assert.equal(c?.body?.body, "Add a test");
});

test("actions: update_item labels and assigns", async () => {
  const { gh } = await call("update_item", { number: 7, add_labels: "bug, ui", remove_labels: "triage", assignees: "sam" }, {
    "POST /repos/acme/widgets/issues/7/labels": [200, []],
    "DELETE /repos/acme/widgets/issues/7/labels/triage": [200, []],
    "POST /repos/acme/widgets/issues/7/assignees": [201, {}],
  });
  assert.deepEqual(gh.find("POST", "/repos/acme/widgets/issues/7/labels")?.body?.labels, ["bug", "ui"]);
  assert.ok(gh.find("DELETE", "/repos/acme/widgets/issues/7/labels/triage"), "removes a label");
  assert.deepEqual(gh.find("POST", "/repos/acme/widgets/issues/7/assignees")?.body?.assignees, ["sam"]);
});

test("actions: write tools validate their arguments", async () => {
  const { validateArgs } = await load("lib/tools.ts");
  assert.equal(validateArgs("create_issue", {}).ok, false, "title is required");
  assert.equal(validateArgs("merge_pr", { number: 9, method: "yolo" }).ok, false, "merge method is an enum");
  assert.equal(validateArgs("set_state", { number: 7, state: "deleted" }).ok, false, "state is open or closed");
});

test("actions: the voice agent's prompt knows it can act, and confirms first", () => {
  const p = readFileSync(join(ROOT, "scripts/sync-agent.ts"), "utf8");
  assert.doesNotMatch(p, /such as merging, deleting or pushing code, say you cannot do that yet/, "still claims it cannot merge");
  for (const n of ["create_issue", "create_pr", "merge_pr", "start_agent"]) assert.match(p, new RegExp(n), `prompt never mentions ${n}`);
  assert.match(p, /merge_pr[^\n]*(yes|confirm)/i, "merging needs an explicit yes");
});

test("actions: start_agent goes to the Mac app, or to the board as a TASK without it", async () => {
  const { agentMessage, boardTask } = await load("lib/agents-bridge.ts");
  assert.deepEqual(agentMessage("start", { task: "fix login", agent: "codex", repo: "acme/widgets" }), { agent: { op: "start", task: "fix login", agent: "codex", repo: "acme/widgets" } });
  assert.equal(agentMessage("start", { task: "x", repo: "acme/widgets" }).agent.agent, "claude", "Claude Code by default");
  assert.deepEqual(agentMessage("stop", { id: "r1" }), { agent: { op: "stop", id: "r1" } });
  assert.equal(boardTask("Sam", "fix login", "claude"), "TASK for Sam's Claude: fix login");
  const page = readFileSync(join(ROOT, "components/useCoworker.ts"), "utf8") + readFileSync(join(ROOT, "lib/agents-bridge.ts"), "utf8");
  assert.match(page, /coworkerAsync/, "agent tools await the app's reply over messageHandlers.coworkerAsync");
  for (const n of AGENTS) assert.match(readFileSync(join(ROOT, "components/useCoworker.ts"), "utf8"), new RegExp(`\\b${n}\\b`), `useCoworker implements ${n}`);
});
