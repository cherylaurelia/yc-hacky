// `coworker run`: start a coding agent on a task in its own worktree; it pushes a branch and opens a PR when done.
//   coworker run "<task>" [--agent claude|codex] [--repo owner/name] [--dir <checkout>] [--detach]
//     prints the run id first; state lives in $COWORKER_HOME/runs/<id>/status.json
//     {id, task, agent, repo, branch, state: running|done|failed|stopped, pr?, log}
//   coworker runs            JSON array of runs, newest first
//   coworker stop <id>       stops a running agent; state becomes stopped
// Without --dir the repo is cloned once into $COWORKER_HOME/repos/<owner>/<name> with `gh repo clone`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { type Env, cli, fakeRelay, sandbox } from "../product/helpers.ts";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Sam", GIT_AUTHOR_EMAIL: "s@x", GIT_COMMITTER_NAME: "Sam", GIT_COMMITTER_EMAIL: "s@x" } }).trim();

// A checkout of acme/widgets whose origin is a local bare repo, plus fake claude, codex and gh on PATH.
function rig() {
  const sb = sandbox();
  const bare = join(sb.home, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  sh(sb.repo, "init", "-q", "-b", "main");
  writeFileSync(join(sb.repo, "README.md"), "widgets\n");
  sh(sb.repo, "add", "README.md");
  sh(sb.repo, "commit", "-qm", "init");
  sh(sb.repo, "remote", "add", "origin", bare);
  sh(sb.repo, "push", "-q", "origin", "main");
  const agentLog = join(sb.home, "agent.log");
  const agent = `#!/usr/bin/env bash
printf '%s\\n' "$(basename "$0") $*" >> "${agentLog}"
case "\${FAKE_AGENT:-edit}" in
  edit) echo "hello" > hello.txt ;;
  none) ;;
  fail) echo "boom" >&2; exit 1 ;;
  sleep) sleep 30 ;;
esac
`;
  for (const name of ["claude", "codex"]) writeFileSync(join(sb.bin, name), agent, { mode: 0o755 });
  writeFileSync(join(sb.bin, "gh"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${sb.ghLog}"
case "$*" in
  "auth status"*) exit 0 ;;
  "pr create"*) echo "https://github.com/acme/widgets/pull/77" ;;
  "repo clone"*) git clone -q "${bare}" "$4" ;;
  *) echo "" ;;
esac
`, { mode: 0o755 });
  const env: Env = { ...sb.env, GIT_AUTHOR_NAME: "Sam", GIT_AUTHOR_EMAIL: "s@x", GIT_COMMITTER_NAME: "Sam", GIT_COMMITTER_EMAIL: "s@x" };
  const status = (id: string) => JSON.parse(readFileSync(join(sb.env.COWORKER_HOME!, "runs", id, "status.json"), "utf8"));
  const agentCalls = () => (existsSync(agentLog) ? readFileSync(agentLog, "utf8") : "");
  return { ...sb, env, bare, status, agentCalls };
}

const runId = (stdout: string) => stdout.trim().split(/\s+/)[0];

test("run: an agent's change becomes a pushed branch and a PR, and you hear about it", async () => {
  const r = rig();
  const relay = await fakeRelay(r.env.COWORKER_HOME!);
  try {
    const out = await cli(["run", "add a hello file", "--dir", r.repo, "--repo", "acme/widgets"], { env: r.env, timeoutMs: 60_000 });
    assert.equal(out.code, 0, out.stderr);
    const id = runId(out.stdout);
    const s = r.status(id);
    assert.equal(s.state, "done", JSON.stringify(s));
    assert.match(s.branch, /^coworker\//);
    assert.equal(s.pr, "https://github.com/acme/widgets/pull/77");
    assert.match(r.agentCalls(), /^claude /m, "Claude Code by default");
    assert.ok(sh(r.bare, "branch", "--list", s.branch), "the branch is pushed");
    assert.match(sh(r.bare, "show", `${s.branch}:hello.txt`), /hello/, "with the agent's change committed");
    assert.match(r.ghCalls(), /pr create.*--repo acme\/widgets/);
    assert.match(String(relay.events.at(-1)?.text), /pull\/77|#77|PR 77|number 77/i, "the done event carries the PR");
    assert.equal(sh(r.repo, "status", "--porcelain"), "", "your checkout is untouched");
    assert.equal(sh(r.repo, "branch", "--show-current"), "main");
  } finally {
    await relay.close();
  }
});

test("run: no changes means no PR, and says so", async () => {
  const r = rig();
  const relay = await fakeRelay(r.env.COWORKER_HOME!);
  try {
    const out = await cli(["run", "just look around", "--dir", r.repo, "--repo", "acme/widgets"], { env: { ...r.env, FAKE_AGENT: "none" }, timeoutMs: 60_000 });
    assert.equal(out.code, 0, out.stderr);
    const s = r.status(runId(out.stdout));
    assert.equal(s.state, "done");
    assert.ok(!s.pr);
    assert.doesNotMatch(r.ghCalls(), /pr create/);
    assert.match(String(relay.events.at(-1)?.text), /no changes/i);
  } finally {
    await relay.close();
  }
});

test("run: a failing agent is reported, not hidden", async () => {
  const r = rig();
  const relay = await fakeRelay(r.env.COWORKER_HOME!);
  try {
    const out = await cli(["run", "break things", "--dir", r.repo, "--repo", "acme/widgets"], { env: { ...r.env, FAKE_AGENT: "fail" }, timeoutMs: 60_000 });
    const s = r.status(runId(out.stdout));
    assert.equal(s.state, "failed");
    assert.ok(existsSync(s.log) && readFileSync(s.log, "utf8").includes("boom"), "the agent's output is in the log");
    assert.match(String(relay.events.at(-1)?.text), /fail/i);
  } finally {
    await relay.close();
  }
});

test("run: codex runs as `codex exec`", async () => {
  const r = rig();
  const out = await cli(["run", "add a hello file", "--agent", "codex", "--dir", r.repo, "--repo", "acme/widgets"], { env: r.env, timeoutMs: 60_000 });
  assert.equal(out.code, 0, out.stderr);
  assert.match(r.agentCalls(), /^codex exec /m);
  assert.equal(r.status(runId(out.stdout)).agent, "codex");
});

test("run: --detach returns at once; runs lists it; stop ends it", async () => {
  const r = rig();
  const env = { ...r.env, FAKE_AGENT: "sleep" };
  const out = await cli(["run", "take forever", "--dir", r.repo, "--repo", "acme/widgets", "--detach"], { env, timeoutMs: 10_000 });
  assert.equal(out.code, 0, out.stderr);
  assert.ok(out.ms < 5000, `detach took ${out.ms} ms`);
  const id = runId(out.stdout);
  let s = r.status(id);
  for (let i = 0; i < 30 && s.state !== "running"; i++) { await new Promise((ok) => setTimeout(ok, 100)); s = r.status(id); }
  assert.equal(s.state, "running");
  const list = JSON.parse((await cli(["runs"], { env })).stdout);
  assert.ok(Array.isArray(list) && list.some((x: { id: string; state: string }) => x.id === id && x.state === "running"), "runs lists it");
  const stop = await cli(["stop", id], { env });
  assert.equal(stop.code, 0, stop.stderr);
  for (let i = 0; i < 30 && s.state === "running"; i++) { await new Promise((ok) => setTimeout(ok, 100)); s = r.status(id); }
  assert.equal(s.state, "stopped");
  assert.doesNotMatch(execFileSync("ps", ["-ax", "-o", "command"], { encoding: "utf8" }), new RegExp(`sleep 30[\\s\\S]*${id}|${id}[\\s\\S]*sleep 30`), "nothing left running");
});

test("run: with only --repo, it clones the repo once and works there", async () => {
  const r = rig();
  const out = await cli(["run", "add a hello file", "--repo", "acme/widgets"], { env: r.env, timeoutMs: 60_000 });
  assert.equal(out.code, 0, out.stderr);
  assert.match(r.ghCalls(), /repo clone acme\/widgets/);
  assert.ok(existsSync(join(r.env.COWORKER_HOME!, "repos/acme/widgets/.git")), "cloned under COWORKER_HOME/repos");
  assert.equal(r.status(runId(out.stdout)).state, "done");
});

test("run: a task is data, never shell", async () => {
  const r = rig();
  const marker = join(r.home, "pwned");
  const out = await cli(["run", `x"; touch ${marker}; echo "$(touch ${marker})`, "--dir", r.repo, "--repo", "acme/widgets"], { env: { ...r.env, FAKE_AGENT: "none" }, timeoutMs: 60_000 });
  assert.equal(out.code, 0, out.stderr);
  assert.ok(!existsSync(marker), "the task text ran as a command");
});
