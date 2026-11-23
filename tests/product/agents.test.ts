// Agent side: the `coworker` CLI (bin/coworker) lets Claude Code, Codex, Cursor or any script talk to you.
// Transport: the local relay (~/.coworker/relay.json, see mac/relay.swift) first, the GitHub board as fallback.
//   coworker ask "<question>" [--agent NAME] [--timeout S]   prints your answer; exit 2 on no answer
//   coworker notify "<text>" [--kind done|blocked|stuck]      fire and forget
//   coworker verdict "<reply>"                                prints allow | deny | stop | none
//   coworker hook claude|codex|cursor                         the hook command each agent runs (stdin JSON)
//   coworker install|uninstall claude|codex|cursor            wires the hooks into that agent's config
//   coworker doctor                                           says what works and what is missing; exit 1 if nothing can reach you
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cli, fakeRelay, gitRepo, readJson, sandbox } from "./helpers.ts";

test("agents: verdict reads a spoken or typed reply", async () => {
  const sb = sandbox();
  const cases: [string, string][] = [
    ["yes allow it", "allow"], ["Allow.", "allow"], ["approve", "allow"], ["go ahead", "allow"],
    ["no, deny", "deny"], ["reject it", "deny"], ["no, don't allow that", "deny"], ["do not run it", "deny"],
    ["stop the session", "stop"], ["kill it", "stop"],
    ["allow it, no wait, deny", "none"], ["what does it do?", "none"], ["", "none"],
  ];
  const wrong: string[] = [];
  for (const [reply, want] of cases) {
    const r = await cli(["verdict", reply], { env: sb.env });
    if (r.stdout.trim() !== want) wrong.push(`"${reply}" -> "${r.stdout.trim()}" (want ${want}) ${r.stderr.slice(0, 200)}`);
  }
  assert.deepEqual(wrong, []);
});

test("agents: ask reaches you through the relay and returns your answer fast", async () => {
  const sb = sandbox();
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    relay.answerWith("use 202", 100);
    const r = await cli(["ask", "202 or 200?", "--agent", "Sam's Codex"], { env: sb.env });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), "use 202");
    assert.ok(r.ms < 2000, `took ${r.ms} ms`);
    assert.equal(relay.events.length, 1);
    assert.equal(relay.events[0].kind, "question");
    assert.equal(relay.events[0].agent, "Sam's Codex");
    assert.equal(relay.events[0].text, "202 or 200?");
    assert.equal(sb.ghCalls(), "", "no GitHub calls when the relay is up");
  } finally {
    await relay.close();
  }
});

test("agents: ask with no answer times out with exit 2", async () => {
  const sb = sandbox();
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    relay.answerWith(null);
    const r = await cli(["ask", "still there?", "--timeout", "1"], { env: sb.env });
    assert.equal(r.code, 2, `exit ${r.code}: ${r.stderr}`);
    assert.match(r.stderr, /no answer/i);
    assert.ok(r.ms < 5000, `took ${r.ms} ms`);
  } finally {
    await relay.close();
  }
});

test("agents: notify posts a done event and returns at once", async () => {
  const sb = sandbox();
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    const r = await cli(["notify", "built 128 pages", "--kind", "done"], { env: sb.env });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.ms < 2000, `took ${r.ms} ms`);
    assert.equal(relay.events[0]?.kind, "done");
    assert.equal(relay.events[0]?.text, "built 128 pages");
  } finally {
    await relay.close();
  }
});

const claudePerm = (cwd: string, cmd: string) =>
  JSON.stringify({ hook_event_name: "PermissionRequest", cwd, session_id: "s1", tool_name: "Bash", tool_input: { command: cmd } });

test("agents: a Claude Code approval goes through the relay, not GitHub", async () => {
  const sb = sandbox(true);
  await gitRepo(sb.repo, sb.env);
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    relay.answerWith("allow", 100);
    const r = await cli(["hook", "claude"], { env: sb.env, input: claudePerm(sb.repo, "npm run migrate"), cwd: sb.repo });
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout || "{}");
    assert.equal(out.hookSpecificOutput?.decision?.behavior, "allow", r.stdout);
    assert.ok(r.ms < 3000, `took ${r.ms} ms`);
    assert.equal(relay.events[0]?.kind, "approval");
    assert.match(String(relay.events[0]?.text), /npm run migrate/);
    assert.match(String(relay.events[0]?.agent), /Claude$/);
    assert.doesNotMatch(sb.ghCalls(), /-f body=/, "nothing posted to GitHub");
  } finally {
    await relay.close();
  }
});

test("agents: Codex install wires PermissionRequest and Stop hooks and keeps the user's own", async () => {
  const sb = sandbox();
  const codex = sb.env.CODEX_HOME!;
  mkdirSync(codex, { recursive: true });
  const mine = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }] } };
  writeFileSync(join(codex, "hooks.json"), JSON.stringify(mine));
  const r = await cli(["install", "codex"], { env: sb.env });
  assert.equal(r.code, 0, r.stderr);
  const h = readJson(join(codex, "hooks.json"));
  const cmds = (ev: string) => JSON.stringify(h.hooks?.[ev] ?? []);
  assert.match(cmds("PermissionRequest"), /coworker[^"]*hook codex/);
  assert.match(cmds("Stop"), /coworker[^"]*hook codex/);
  assert.match(cmds("PreToolUse"), /echo mine/, "the user's own hook is kept");
});

test("agents: a Codex approval is answered through the relay", async () => {
  const sb = sandbox();
  await gitRepo(sb.repo, sb.env);
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    relay.answerWith("deny", 100);
    const input = JSON.stringify({ hook_event_name: "PermissionRequest", cwd: sb.repo, session_id: "c1", model: "gpt-5", tool_name: "Bash", tool_input: { command: "rm -rf dist" } });
    const r = await cli(["hook", "codex"], { env: sb.env, input, cwd: sb.repo });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout || "{}").hookSpecificOutput?.decision?.behavior, "deny", r.stdout);
    assert.match(String(relay.events[0]?.agent), /Codex$/);
  } finally {
    await relay.close();
  }
});

test("agents: Cursor install wires beforeShellExecution and stop, keeping the user's own", async () => {
  const sb = sandbox();
  const dir = join(sb.home, ".cursor");
  mkdirSync(dir);
  writeFileSync(join(dir, "hooks.json"), JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "echo mine" }] } }));
  const r = await cli(["install", "cursor"], { env: sb.env });
  assert.equal(r.code, 0, r.stderr);
  const h = readJson(join(dir, "hooks.json"));
  assert.equal(h.version, 1);
  assert.match(JSON.stringify(h.hooks.beforeShellExecution ?? []), /coworker[^"]*hook cursor/);
  assert.match(JSON.stringify(h.hooks.stop ?? []), /coworker[^"]*hook cursor/);
  assert.match(JSON.stringify(h.hooks.afterFileEdit), /echo mine/);
});

test("agents: a Cursor shell command waits for your allow or deny", async () => {
  const sb = sandbox();
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    const input = JSON.stringify({ hook_event_name: "beforeShellExecution", command: "rm -rf build", cwd: sb.repo, conversation_id: "k1" });
    relay.answerWith("allow", 50);
    let r = await cli(["hook", "cursor"], { env: sb.env, input });
    assert.equal(JSON.parse(r.stdout || "{}").permission, "allow", r.stdout + r.stderr);
    relay.answerWith("deny", 50);
    r = await cli(["hook", "cursor"], { env: sb.env, input });
    assert.equal(JSON.parse(r.stdout || "{}").permission, "deny", r.stdout + r.stderr);
    assert.match(String(relay.events[0]?.agent), /Cursor$/);
    assert.match(String(relay.events[0]?.text), /rm -rf build/);
  } finally {
    await relay.close();
  }
});

test("agents: Claude Code install then uninstall leaves settings exactly as they were", async () => {
  const sb = sandbox();
  const dir = join(sb.home, ".claude");
  mkdirSync(dir);
  const original = { theme: "dark", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(original, null, 2));
  let r = await cli(["install", "claude"], { env: sb.env });
  assert.equal(r.code, 0, r.stderr);
  const s = readJson(join(dir, "settings.json"));
  assert.match(JSON.stringify(s.hooks.PermissionRequest ?? []), /coworker[^"]*hook claude/);
  assert.match(JSON.stringify(s.hooks.Stop), /echo mine/);
  r = await cli(["uninstall", "claude"], { env: sb.env });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(readJson(join(dir, "settings.json")), original);
  assert.ok(!existsSync(join(dir, "coworker-hook")), "hook state is removed on uninstall");
});

test("agents: doctor says what is missing", async () => {
  const sb = sandbox();
  let r = await cli(["doctor"], { env: sb.env });
  assert.equal(r.code, 1, `no relay and no gh should fail: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout + r.stderr, /relay/i);
  assert.match(r.stdout + r.stderr, /\bgh\b/);
  const relay = await fakeRelay(sb.env.COWORKER_HOME!);
  try {
    r = await cli(["doctor"], { env: sb.env });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /relay.*ok/i);
  } finally {
    await relay.close();
  }
});

test("agents: with no relay, ask falls back to the team board", async () => {
  const sb = sandbox(true);
  await gitRepo(sb.repo, sb.env);
  const r = await cli(["ask", "deploy now?", "--timeout", "1"], { env: { ...sb.env, COWORKER_BOARD: "4" }, cwd: sb.repo });
  assert.equal(r.code, 2, `exit ${r.code}: ${r.stderr}`);
  assert.match(sb.ghCalls(), /issues\/4\/comments -f body=.*deploy now\?/);
});

test("agents: the CLI never prints the relay token", async () => {
  const sb = sandbox();
  const relay = await fakeRelay(sb.env.COWORKER_HOME!, "s3cret-tok3n");
  try {
    relay.answerWith("ok", 20);
    const outs = [await cli(["doctor"], { env: sb.env }), await cli(["ask", "x"], { env: sb.env })];
    for (const o of outs) assert.doesNotMatch(o.stdout + o.stderr, /s3cret-tok3n/);
    assert.ok(readFileSync(join(sb.env.COWORKER_HOME!, "relay.json"), "utf8").includes("s3cret"));
  } finally {
    await relay.close();
  }
});
