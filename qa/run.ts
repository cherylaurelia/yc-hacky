// Runs qa/scenarios.ts against the live agent in text mode with the real tools.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=$HOME/.yc-hacky.env qa/run.ts [--runs 2] [--only id,id] [--concurrency 3] [--out qa/results.md]
// Needs the dev server on TOOL_BASE (default http://localhost:3200) started with GITHUB_TOKEN,
// WRITE_REPOS=cherylaurelia/yc-hacky, DEMO_REPOS=cherylaurelia/yc-hacky (the repo is private) and BOARD_ISSUE=4.
// Alerts are injected directly (no board polling), so runs do not depend on live board posts.
// Every board post the agent writes is deleted again after its run.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { Conversation } from "@elevenlabs/react";
import { type Alert, checkAnswer, findAlert, markAnswered, normReq } from "../lib/alerts.ts";
import { type BoardAlert, type Comment, alertMessage, alertsFrom, parsePost } from "../lib/board.ts";
import { localNow } from "../lib/now.ts";
import { TOOL_SPECS } from "../lib/tool-specs.ts";
import { type Call, DEFAULT_REPO, type Post, SCENARIOS, type Scenario, type Turn, voiceProblems } from "./scenarios.ts";

const BASE = process.env.TOOL_BASE ?? "http://localhost:3200";
const BOARD = 4;
const BOARD_REPO = "cherylaurelia/yc-hacky";
const ME = "cherylaurelia";
const QUIET_MS = 3500;
const TURN_MAX_MS = 75_000;
const RUN_MAX_MS = 240_000;

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const RUNS = Number(flag("runs") ?? 2);
const ONLY = flag("only")?.split(",");
const CONCURRENCY = Number(flag("concurrency") ?? 3);
const OUT = flag("out") ?? "qa/results.md";
if (!(RUNS >= 1) || !(CONCURRENCY >= 1)) {
  console.error("usage: node qa/run.ts [--runs N] [--only id,id] [--concurrency N] [--out file]");
  process.exit(2);
}
// QA_AGENT_ID points the run at a scratch agent (see qa/try-fix.ts); default is the live one.
const agent_id = process.env.QA_AGENT_ID ?? (JSON.parse(readFileSync(new URL("../agent.json", import.meta.url), "utf8")) as { agent_id: string }).agent_id;
if (!agent_id) throw new Error("agent.json has no agent_id");

// Every sweep looks back to here, so parallel runs that post identical text cannot hide each other's posts.
const STARTED = new Date(Date.now() - 10_000).toISOString();
const ALL_TAILS = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The agent only accepts server-minted sessions (platform_settings.auth.enable_auth), so mint a
// text session the way app/api/convai-token does, straight from ElevenLabs.
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set. Run with: node --env-file=$HOME/.yc-hacky.env qa/run.ts");
async function mintSignedUrl(): Promise<string> {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${new URLSearchParams({ agent_id })}`, {
    headers: { "xi-api-key": KEY! },
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { signed_url?: string };
  if (!res.ok || !j.signed_url) throw new Error(`could not mint a session (HTTP ${res.status})`);
  return j.signed_url;
}
const gh = (args: string[]) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// ---------- alert text, exactly as components/useCoworker.ts builds it ----------

// Copy of spokenAlerts in components/useCoworker.ts (it is not exported).
function spokenAlerts(played: BoardAlert[], missed: BoardAlert[]): string {
  const parts: string[] = [];
  if (played.length) {
    const who = played.map((a) => a.from).join(" and ");
    parts.push(
      `${alertMessage(played)}\nThe user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell ${who}?" If it says "needs approval (req X)", reply only: "Allow?"`,
    );
  }
  if (missed.length) parts.push(alertMessage(missed));
  return parts.join("\n");
}

let commentId = 9_000_000_000;
function toAlerts(posts: Post[]): BoardAlert[] {
  const comments: Comment[] = posts.map((p) => ({
    id: ++commentId,
    user: { login: p.login ?? ME },
    body: `[${p.agent}] ${p.text}${p.ctx ? `\n\n<!-- coworker:${JSON.stringify({ v: 1, agent: p.agent, ...p.ctx })} -->` : ""}`,
    created_at: new Date().toISOString(),
  }));
  return alertsFrom(comments.map((c) => parsePost(c, ME)));
}

// ---------- one run of one scenario ----------

type StepResult = { step: number; fails: string[]; voice: string[] };
type RunResult = { id: string; run: number; steps: StepResult[]; firstReplyMs: number | null; replyMs: number[]; log: string[]; error?: string; ms: number };

type Pending = { tail: string };

// Deletes one matching board comment per item (every matching one when `every`).
function sweepPosts(items: Pending[], every = false): { deleted: number[]; left: string[] } {
  const deleted: number[] = [];
  const left: string[] = [];
  for (const it of items) {
    let rows: { id: number; body: string; user: { login: string } }[] = [];
    try {
      rows = JSON.parse(gh(["api", `repos/${BOARD_REPO}/issues/${BOARD}/comments?per_page=100&since=${encodeURIComponent(STARTED)}`]));
    } catch (e) {
      left.push(`could not list board comments: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const hit = rows.filter((r) => r.user.login === ME && /^\[[^\]]*Coworker\] /.test(r.body) && r.body.endsWith(it.tail));
    if (!hit.length && !every) left.push(`no board comment found for "${it.tail}"`);
    for (const h of every ? hit : hit.slice(-1)) {
      try {
        gh(["api", "-X", "DELETE", `repos/${BOARD_REPO}/issues/comments/${h.id}`]);
        deleted.push(h.id);
      } catch (e) {
        left.push(`FAILED to delete comment ${h.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return { deleted, left };
}

async function runOnce(sc: Scenario, run: number): Promise<RunResult> {
  const t00 = Date.now();
  const repo = sc.repo ?? DEFAULT_REPO;
  const log: string[] = [];
  const at = () => `+${((Date.now() - t00) / 1000).toFixed(1)}s`;
  const stamp = (s: string) => log.push(`${at()} ${s}`);
  const cleanup: Pending[] = [];
  const reqIds: string[] = [];
  const alerts: Alert[] = [];
  const answered = new Set<string>();
  let seq = 0;

  let cur: Turn = { input: "(greeting)", beforeCall: 0, agent: [], calls: [], firstReplyMs: null, timedOut: false };
  let sentAt = Date.now();
  let lastEvent = Date.now();
  let lastAgentAt = 0;
  let lastToolEnd = 0;
  let pending = 0;

  const clientTools = Object.fromEntries(
    TOOL_SPECS.map((s) => [
      s.name,
      async (args: Record<string, unknown>) => {
        const t0 = Date.now();
        pending++;
        lastEvent = t0;
        const sent = s.name.startsWith("board_") || s.name === "answer_request" ? { ...args, board: BOARD } : args;
        const rec: Call = { name: s.name, args: sent, result: "", error: false, ms: 0 };
        if (!cur.calls.length) cur.beforeCall = cur.agent.length;
        cur.calls.push(rec);
        try {
          if ("local" in s) {
            const r = findAlert(alerts, typeof sent.agent === "string" ? sent.agent : undefined, typeof sent.req === "string" ? sent.req : undefined);
            if ("error" in r) throw new Error(r.error);
            rec.result = `Showing the ${r.alert.kind ?? "alert"} from ${r.alert.from} on screen${r.alert.ctx?.diff ? ", with its diff" : ""}.`;
            return rec.result;
          }
          if (s.name === "answer_request") {
            const wrong = checkAnswer(alerts, normReq(sent.request_id));
            if (wrong) throw new Error(wrong);
          }
          const res = await fetch(`${BASE}/api/tool/${s.name}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ repo, args: sent }),
            signal: AbortSignal.timeout(25_000),
          });
          const j = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
          if (!res.ok || typeof j.result !== "string") throw new Error(j.error ?? `Tool failed (HTTP ${res.status}).`);
          rec.result = j.result;
          if (s.name === "answer_request") {
            const id = normReq(sent.request_id);
            const note = String(sent.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
            cleanup.push({ tail: `req ${id} ${sent.decision === "deny" || sent.decision === "stop" ? sent.decision : "allow"}${note ? ` ${note}` : ""}` });
            answered.add(id);
            alerts.splice(0, alerts.length, ...markAnswered(alerts, answered));
          } else if (s.name === "board_post") {
            const to = String(sent.to ?? "").trim().replace(/^@/, "");
            cleanup.push({ tail: `${to ? `@${to} ` : ""}${String(sent.text ?? "").trim().slice(0, 2000)}` });
          }
          return rec.result;
        } catch (e) {
          rec.error = true;
          rec.result = e instanceof Error ? e.message : "Tool failed.";
          throw new Error(rec.result);
        } finally {
          rec.ms = Date.now() - t0;
          pending--;
          lastEvent = lastToolEnd = Date.now();
          stamp(`  [tool] ${rec.name}(${JSON.stringify(rec.args)}) -> ${rec.error ? "ERROR " : ""}${rec.result.replace(/\s+/g, " ").slice(0, 220)} (${rec.ms} ms)`);
        }
      },
    ]),
  );

  let conv: Awaited<ReturnType<typeof Conversation.startSession>> | undefined;
  const results: StepResult[] = [];
  const replyMs: number[] = [];
  let error: string | undefined;
  try {
    conv = await Promise.race([
      Conversation.startSession({
        signedUrl: await mintSignedUrl(),
        textOnly: true,
        connectionType: "websocket",
        dynamicVariables: { repo, now: localNow() },
        clientTools,
        onMessage: ({ role, message }) => {
          if (role !== "agent") return;
          lastEvent = lastAgentAt = Date.now();
          if (cur.firstReplyMs === null) cur.firstReplyMs = lastAgentAt - sentAt;
          cur.agent.push(message);
          stamp(`AGENT: ${message}`);
        },
        onError: (m) => stamp(`  [error] ${m}`),
        onUnhandledClientToolCall: (c) => stamp(`  [unhandled tool call] ${c.tool_name}`),
      }),
      sleep(30_000).then(() => {
        throw new Error("timed out starting the session");
      }),
    ]);
    const c = conv;

    const settle = async (t: Turn, needReply = true) => {
      const deadline = Date.now() + TURN_MAX_MS;
      for (;;) {
        await sleep(150);
        const replied = t.agent.length >= 1 && (t.calls.length === 0 || lastAgentAt > lastToolEnd);
        if (pending === 0 && (replied || !needReply) && Date.now() - lastEvent > QUIET_MS) return;
        if (Date.now() > deadline) {
          t.timedOut = true;
          return;
        }
        if (Date.now() - t00 > RUN_MAX_MS) throw new Error("run exceeded its time limit");
      }
    };

    await settle(cur); // the greeting
    for (const [i, step] of sc.steps.entries()) {
      const t: Turn = { input: "", beforeCall: 0, agent: [], calls: [], firstReplyMs: null, timedOut: false };
      let text: string;
      if (step.alert) {
        const a = toAlerts(step.alert);
        if (!a.length) throw new Error("scenario bug: the posts did not produce an alert");
        const played = step.played !== false;
        text = spokenAlerts(played ? a : [], played ? [] : a);
        for (const x of a) {
          if (x.req) reqIds.push(x.req);
          alerts.push({ ...x, seq: ++seq, state: x.why === "blocked" ? "asking" : "told" });
        }
      } else text = Array.isArray(step.say) ? step.say[(run - 1) % step.say.length] : (step.say ?? "");
      t.input = text;
      cur = t;
      sentAt = Date.now();
      lastEvent = sentAt;
      stamp(`${step.alert ? "ALERT" : "USER "}: ${text.replace(/\n/g, " / ")}`);
      c.sendUserMessage(text);
      await settle(t);
      if (t.timedOut) stamp("  [timeout] no settled reply in time");
      if (t.firstReplyMs !== null) replyMs.push(t.firstReplyMs);
      const fails: string[] = [];
      if (t.timedOut && !t.agent.length) fails.push("the agent never replied (timeout)");
      step.expect(t, (cond, msg) => {
        if (!cond) fails.push(msg);
      });
      results.push({ step: i, fails, voice: voiceProblems(t, reqIds) });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    stamp(`  [run error] ${error}`);
  } finally {
    await conv?.endSession().catch((e: unknown) => stamp(`  [endSession] ${e instanceof Error ? e.message : e}`));
    if (cleanup.length) {
      for (const c of cleanup) ALL_TAILS.add(c.tail);
      await sleep(1500);
      const r = sweepPosts(cleanup);
      stamp(`  [cleanup] deleted board comments ${r.deleted.join(", ") || "none"}${r.left.length ? `; PROBLEMS: ${r.left.join(" | ")}` : ""}`);
      if (r.left.length) error = `${error ? `${error}; ` : ""}cleanup: ${r.left.join(" | ")}`;
    }
  }
  return { id: sc.id, run, steps: results, firstReplyMs: replyMs[0] ?? null, replyMs, log, error, ms: Date.now() - t00 };
}

// ---------- run everything, write the report ----------

const todo = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id)).flatMap((s) => Array.from({ length: RUNS }, (_, i) => ({ s, run: i + 1 })));
const all: RunResult[] = [];
let next = 0;
async function worker() {
  while (next < todo.length) {
    const { s, run } = todo[next++];
    let r = await runOnce(s, run);
    // A run that never got a session is infrastructure, not an agent failure: retry once.
    if (r.error && /starting the session|WebSocket|concurr|limit/i.test(r.error) && !r.steps.length) {
      await sleep(5000);
      r = await runOnce(s, run);
    }
    all.push(r);
    const pass = !r.error && r.steps.every((x) => !x.fails.length);
    console.log(`${pass ? "PASS" : "FAIL"} ${s.id} run ${run}  first reply ${r.firstReplyMs ?? "n/a"} ms${r.error ? `  ERROR ${r.error}` : ""}`);
    for (const st of r.steps) for (const f of st.fails) console.log(`    step ${st.step + 1}: ${f}`);
    for (const st of r.steps) if (st.voice.length) console.log(`    step ${st.step + 1} voice: ${st.voice.join(", ")}`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));

// Final safety sweep: nothing this run posted may stay on the board.
const final = sweepPosts([...ALL_TAILS].map((tail) => ({ tail })), true);
console.log(`final sweep: deleted ${final.deleted.length} leftover comment(s)${final.left.length ? `; PROBLEMS: ${final.left.join(" | ")}` : ""}`);
if (final.deleted.length) console.log(`  (these were leftovers: ${final.deleted.join(", ")})`);

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)] : null);
const cell = (n: number | null) => (n === null ? "n/a" : `${(n / 1000).toFixed(1)}s`);
const order = SCENARIOS.map((s) => s.id);
all.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.run - b.run);

const ok = (r: RunResult) => !r.error && r.steps.every((x) => !x.fails.length);
const voiceOk = (r: RunResult) => r.steps.every((x) => !x.voice.length);
const rows: string[] = [];
for (const sc of SCENARIOS) {
  const rs = all.filter((r) => r.id === sc.id);
  if (!rs.length) continue;
  const fails = [...new Set(rs.flatMap((r) => [...r.steps.flatMap((x) => x.fails.map((f) => `step ${x.step + 1}: ${f}`)), ...(r.error ? [`error: ${r.error}`] : [])]))];
  const voice = [...new Set(rs.flatMap((r) => r.steps.flatMap((x) => x.voice.map((f) => `step ${x.step + 1}: ${f}`))))];
  rows.push(`| ${sc.id} | ${rs.filter(ok).length}/${rs.length} | ${rs.filter(voiceOk).length}/${rs.length} | ${cell(median(rs.flatMap((r) => (r.firstReplyMs === null ? [] : [r.firstReplyMs]))))} | ${[...fails.map((f) => f.replace(/\|/g, "/")), ...voice.map((f) => `voice ${f}`)].join("; ") || "none"} |`);
}
const firsts = all.flatMap((r) => (r.firstReplyMs === null ? [] : [r.firstReplyMs]));
const everyReply = all.flatMap((r) => r.replyMs);
const total = all.length;
const md = [
  "# Voice agent QA results",
  "",
  `Agent ${agent_id}, text mode, real tools against ${BASE}, board #${BOARD} of ${BOARD_REPO}. ${RUNS} runs per scenario, ${new Date().toISOString()}.`,
  "",
  `Scenario pass: ${all.filter(ok).length}/${total}. Voice-safe (every spoken turn at most 3 sentences, no URLs, hashes, markdown, tool names or request ids): ${all.filter(voiceOk).length}/${total}.`,
  `Latency to first agent reply after the first input (includes tool calls): median ${cell(median(firsts))}, p90 ${cell(pct(firsts, 0.9))}, max ${cell(Math.max(0, ...firsts))}. Over every turn: median ${cell(median(everyReply))}, p90 ${cell(pct(everyReply, 0.9))}.`,
  "",
  "| scenario | pass | voice-safe | first reply (median) | failing checks |",
  "|---|---|---|---|---|",
  ...rows,
  "",
  "## Transcripts",
  "",
  ...all.flatMap((r) => [
    `<details><summary>${ok(r) ? "PASS" : "FAIL"} ${r.id} run ${r.run} (${(r.ms / 1000).toFixed(0)}s)${voiceOk(r) ? "" : " [voice]"}</summary>`,
    "",
    "```",
    ...r.log,
    ...r.steps.flatMap((x) => [...x.fails.map((f) => `  !! step ${x.step + 1}: ${f}`), ...x.voice.map((f) => `  !! step ${x.step + 1} voice: ${f}`)]),
    "```",
    "",
    "</details>",
    "",
  ]),
].join("\n");
writeFileSync(OUT, md);
writeFileSync("/tmp/qa-results.json", JSON.stringify(all, null, 1));
console.log(`\nwrote ${OUT}: ${all.filter(ok).length}/${total} scenario runs passed, ${all.filter(voiceOk).length}/${total} voice-safe`);
process.exit(0);
