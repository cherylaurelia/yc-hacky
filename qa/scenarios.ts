// Scripted QA scenarios for the live Coworker voice agent (text mode, real tools).
// Each scenario is a list of steps. A step either says something as the user or injects a
// board alert, then asserts on what the agent did in that turn (tool calls, spoken text).
// Alerts are built from raw board comments through the app's own parsePost/alertsFrom, so the
// injected text is exactly what the browser would send. Run with qa/run.ts.
import type { Ctx } from "../lib/board.ts";

export type Call = { name: string; args: Record<string, unknown>; result: string; error: boolean; ms: number };
export type Turn = {
  input: string;
  beforeCall: number; // agent messages already spoken when the first tool call started
  agent: string[]; // every agent message in the turn, in order
  calls: Call[];
  firstReplyMs: number | null; // from sending the input to the first agent message
  timedOut: boolean;
};
export type Ok = (cond: unknown, msg: string) => void;
export type Post = { agent: string; text: string; login?: string; ctx?: Partial<Ctx> };
export type Step = {
  say?: string | string[]; // an array holds phrasings: run N uses variant N (wrapping)
  alert?: Post[];
  // true: the post was "played aloud" first (the normal path for approvals and blocked posts).
  // false: the agent has to announce it itself (stuck loops, or a failed voice).
  played?: boolean;
  expect: (t: Turn, ok: Ok) => void;
};
export type Scenario = { id: string; title: string; repo?: string; steps: Step[] };

export const DEFAULT_REPO = "cherylaurelia/yc-hacky";
const ME = "cherylaurelia";

// ---------- helpers ----------

export const said = (t: Turn) => t.agent.join(" ").trim();
const calls = (t: Turn, name: string) => t.calls.filter((c) => c.name === name);
const WRITES = ["board_post", "answer_request"];
const wrote = (t: Turn) => t.calls.filter((c) => WRITES.includes(c.name)).map((c) => c.name);
const strArg = (c: Call | undefined, k: string) => String(c?.args[k] ?? "");
const sentences = (s: string) => (s.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).filter((x) => /\w/.test(x)).length;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const asks = (s: string) => s.includes("?");

// Spoken-voice rules that apply to every turn of every scenario. Returns the broken rules.
export function voiceProblems(t: Turn, reqIds: string[]): string[] {
  const s = said(t);
  if (!s) return [];
  const bad: string[] = [];
  if (sentences(s) > 3) bad.push(`more than 3 sentences (${sentences(s)})`);
  if (words(s) > 75) bad.push(`too long (${words(s)} words)`);
  if (/https?:\/\/|www\.|github\.com/i.test(s)) bad.push("reads a URL");
  if (/\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/i.test(s)) bad.push("reads a hash");
  if (/[*`#]|\]\(|^\s*[-•]\s/m.test(s)) bad.push("markdown in speech");
  if (/\b[a-z]+_[a-z_]+\b/.test(s)) bad.push("says a tool or identifier name");
  if (/BOARD ALERT|you said|\breq\b|request id/i.test(s)) bad.push("reads alert plumbing");
  if (t.calls.length && t.beforeCall > 0) bad.push("talks before its tool call");
  for (const id of reqIds) if (s.toLowerCase().includes(id)) bad.push(`says request id ${id}`);
  return bad;
}

const post = (agent: string, text: string, ctx?: Partial<Ctx>, login = ME): Post => ({ agent, text, login, ctx });
const hoursSince11 = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 - 11;
};

const R = {
  allow: "7c3e91",
  deny: "2b8d4f",
  stuck: "5e0f2a",
  stuckNo: "8d1c77",
  show: "41ac9e",
  maybe: "d00d17",
  two: "9a6b30",
};

const DIFF = [
  "--- a/app/login/page.tsx",
  "+++ b/app/login/page.tsx",
  "@@ -10,6 +10,8 @@ export default function Login() {",
  "-  const session = await getSession();",
  "+  const session = await getSession({ refresh: true });",
  "+  if (!session) redirect('/signin');",
].join("\n");

// ---------- scenarios ----------

export const SCENARIOS: Scenario[] = [
  {
    id: "digest",
    title: "Board digest question, then a board digest with a 'since 11' window",
    steps: [
      {
        say: ["What are the agents up to?", "Catch me up."],
        expect: (t, ok) => {
          ok(calls(t, "board_digest").length === 1, "calls board_digest once");
          ok(!wrote(t).length, "writes nothing");
          ok(said(t), "says something");
        },
      },
      {
        say: ["Anything from the agents on the board since 11?", "What have the agents done since 11?"],
        expect: (t, ok) => {
          const c = calls(t, "board_digest")[0];
          const want = hoursSince11() * 60;
          const m = Number(c?.args.since_minutes);
          ok(c, "calls board_digest");
          ok(m >= want - 20 && m <= want + 90, `since_minutes is about ${Math.round(want)} (got ${c?.args.since_minutes})`);
        },
      },
    ],
  },
  {
    id: "approval-allow",
    title: "Approval, agent announces it, user allows",
    steps: [
      {
        alert: [post("Aidan's Claude", `needs approval (req ${R.allow}): Bash npm install zod in yc-hacky`)],
        played: false,
        expect: (t, ok) => {
          const s = said(t);
          ok(/aidan/i.test(s), "names Aidan's Claude");
          ok(/zod|install/i.test(s), "says what it wants to run");
          ok(/allow\?/i.test(s), "asks 'Allow?'");
          ok(!t.calls.length, "calls no tool for the alert (no digest, no answer yet)");
        },
      },
      {
        say: ["Yes, go ahead.", "Sure, do it."],
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length === 1, "calls answer_request once");
          ok(strArg(c[0], "request_id") === R.allow, "uses the alert's request id");
          ok(strArg(c[0], "decision") === "allow", "decision is allow");
          ok(!calls(t, "board_post").length, "does not use board_post for an approval");
          ok(/^allowed\.?$/i.test(said(t)), `says only "Allowed." (said: ${said(t)})`);
        },
      },
    ],
  },
  {
    id: "approval-deny",
    title: "Approval (already played aloud), user denies with a reason",
    steps: [
      {
        alert: [post("Aidan's Claude", `needs approval (req ${R.deny}): Bash rm -rf node_modules in yc-hacky`)],
        played: true,
        expect: (t, ok) => {
          ok(/^allow\?$/i.test(said(t)), `says only "Allow?" (said: ${said(t)})`);
          ok(!t.calls.length, "calls no tool");
        },
      },
      {
        say: ["No, don't. Wrong folder.", "Deny it, it's the wrong folder."],
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length === 1, "calls answer_request once");
          ok(strArg(c[0], "decision") === "deny", "decision is deny");
          ok(strArg(c[0], "request_id") === R.deny, "uses the alert's request id");
          ok(/wrong folder/i.test(strArg(c[0], "note")), `passes the reason as note (note: ${strArg(c[0], "note")})`);
          ok(/^denied\.?$/i.test(said(t)), `says only "Denied." (said: ${said(t)})`);
        },
      },
    ],
  },
  {
    id: "stuck-stop",
    title: "Stuck-loop alert, user says stop it",
    steps: [
      {
        alert: [post("Eithan's Claude", `stuck: retried npm test 6 times in 20 min, about $8.40 so far (req ${R.stuck})`, { kind: "stuck", req: R.stuck, stuck: { count: 6, minutes: 20, cost_usd: 8.4, signature: "npm test" } })],
        played: false,
        expect: (t, ok) => {
          const s = said(t);
          ok(/eithan/i.test(s), "names Eithan's Claude");
          ok(/\b(6|six)\b/i.test(s) && /\b(20|twenty)\b/i.test(s), "says the retries and minutes");
          ok(/\b(8|eight)\b/i.test(s), "says about 8 dollars");
          ok(/stop it\?/i.test(s), "asks 'Want me to stop it?'");
          ok(!t.calls.length, "calls no tool yet");
        },
      },
      {
        say: "Yes, stop it.",
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length === 1, "calls answer_request once");
          ok(strArg(c[0], "decision") === "stop", "decision is stop");
          ok(strArg(c[0], "request_id") === R.stuck, "uses the stuck alert's request id");
          ok(/^stopped\.?$/i.test(said(t)), `says only "Stopped." (said: ${said(t)})`);
        },
      },
      {
        say: "Yes, stop it.",
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length <= 1 && c.every((x) => x.error), `a repeated stop is not sent twice (calls: ${c.map((x) => (x.error ? "error" : "ok")).join(",") || "none"})`);
          ok(said(t) && sentences(said(t)) <= 2, `at most two short sentences (said: ${said(t)})`);
        },
      },
    ],
  },
  {
    id: "stuck-leave",
    title: "Stuck-loop alert, user says leave it",
    steps: [
      {
        alert: [post("Eithan's Claude", `stuck: retried pytest 4 times in 12 min, about $3.10 so far (req ${R.stuckNo})`, { kind: "stuck", req: R.stuckNo, stuck: { count: 4, minutes: 12, cost_usd: 3.1, signature: "pytest" } })],
        played: false,
        expect: (t, ok) => {
          ok(asks(said(t)) && /stop/i.test(said(t)), "asks whether to stop it");
        },
      },
      {
        say: ["No, leave it.", "Nah, let it run."],
        expect: (t, ok) => {
          ok(!t.calls.length, "calls no tool");
          ok(/leaving it/i.test(said(t)), `says "Okay, leaving it." (said: ${said(t)})`);
        },
      },
    ],
  },
  {
    id: "show-me",
    title: "Show me after an approval alert, then allow",
    steps: [
      {
        alert: [post("Aidan's Claude", `needs approval (req ${R.show}): Edit app/login/page.tsx in yc-hacky`, { kind: "approval", req: R.show, tool: "Edit", file: "app/login/page.tsx", line: 10, diff: DIFF })],
        played: true,
        expect: (t, ok) => {
          ok(/^allow\?$/i.test(said(t)), `says only "Allow?" (said: ${said(t)})`);
        },
      },
      {
        say: ["Show me.", "What's the diff?"],
        expect: (t, ok) => {
          const c = calls(t, "show_me");
          ok(c.length === 1, "calls show_me once");
          ok(!c[0]?.error, "show_me did not error");
          ok(!wrote(t).length, "does not answer the request yet");
          const s = said(t);
          ok(s && sentences(s) <= 1, `one short line (said: ${s})`);
          ok(!/[{}<>;=]|\+\+\+|@@|getSession|redirect|signin/i.test(s), "does not read the diff aloud");
        },
      },
      {
        say: "Okay, allow it.",
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length === 1 && strArg(c[0], "decision") === "allow" && strArg(c[0], "request_id") === R.show, "answers allow for the same request");
        },
      },
    ],
  },
  {
    id: "relay",
    title: "Blocked agent asks a question, relay with readback and yes",
    steps: [
      {
        alert: [post("Eithan's Codex", "@cherylaurelia blocked: should the call API return 202 or 200 when the call is queued? Waiting on your answer before I wire the client.")],
        played: true,
        expect: (t, ok) => {
          ok(/what should i tell/i.test(said(t)) && /eithan/i.test(said(t)), `asks "What should I tell Eithan's Codex?" (said: ${said(t)})`);
          ok(!t.calls.length, "calls no tool (no digest to answer an alert)");
        },
      },
      {
        say: ["Tell it to return 202.", "Say 202."],
        expect: (t, ok) => {
          ok(!calls(t, "board_post").length, "reads back before posting, does not post yet");
          ok(/202/.test(said(t)), `reads back the answer (said: ${said(t)})`);
          ok(asks(said(t)) || /\b(ok|okay|sound|good|right|confirm)\b/i.test(said(t)), "waits for a yes");
        },
      },
      {
        say: ["Yes.", "Yeah, send it."],
        expect: (t, ok) => {
          const c = calls(t, "board_post");
          ok(c.length === 1, "calls board_post once");
          ok(/202/.test(strArg(c[0], "text")), `text carries the answer (text: ${strArg(c[0], "text")})`);
          ok(/eithan/i.test(strArg(c[0], "text")), "names the agent in the text");
          ok(strArg(c[0], "to").toLowerCase() === ME, `to is the login from the alert (to: ${strArg(c[0], "to")})`);
          ok(!calls(t, "answer_request").length, "does not use answer_request for a plain question");
          ok(/^sent\.?$/i.test(said(t)), `says only "Sent." (said: ${said(t)})`);
        },
      },
    ],
  },
  {
    id: "read-only-write",
    title: "Board post on a read-only repo is refused plainly",
    repo: "octocat/Hello-World",
    steps: [
      {
        say: "Tell everyone on the board thanks for the update.",
        expect: (t, ok) => {
          ok(!calls(t, "board_post").length, "reads the message back first, no write yet");
          ok(/thanks/i.test(said(t)) && asks(said(t)), `reads it back and asks for a yes (said: ${said(t)})`);
        },
      },
      {
        say: "Yes.",
        expect: (t, ok) => {
          const c = calls(t, "board_post");
          ok(c.length >= 1 && c.length <= 2, `tries the write at most twice (tried ${c.length})`);
          ok(c.every((x) => x.error), "the server refused it");
          const s = said(t);
          ok(/can't|cannot|can not|couldn't|could not|unable|not able|only read|read.only|don't have|no write|isn't allowed|not allowed/i.test(s), `says plainly it cannot write (said: ${s})`);
          ok(!/\bi(?:'ve| have)? (?:posted|commented|added|sent)\b|\b(?:it|that|comment) (?:was|is|has been|got) (?:posted|added|sent)\b|\ball set\b|^(?:done|posted|sent)\b/i.test(s), `does not claim success (said: ${s})`);
        },
      },
    ],
  },
  {
    id: "ambiguous",
    title: "Ambiguous answer ('hmm maybe') is re-asked, then resolved",
    steps: [
      {
        alert: [post("Aidan's Claude", `needs approval (req ${R.maybe}): Bash git push origin main in yc-hacky`)],
        played: true,
        expect: (t, ok) => {
          ok(/allow\?/i.test(said(t)), "asks 'Allow?'");
        },
      },
      {
        say: ["Hmm, maybe.", "I'm not sure, hmm."],
        expect: (t, ok) => {
          ok(!wrote(t).length, "does not answer the request on a maybe");
          ok(asks(said(t)) || /allow|deny/i.test(said(t)), `asks again or says what it is waiting for (said: ${said(t)})`);
        },
      },
      {
        say: "Okay yes, allow it.",
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length === 1 && strArg(c[0], "decision") === "allow" && strArg(c[0], "request_id") === R.maybe, "then answers allow once");
        },
      },
    ],
  },
  {
    id: "two-alerts",
    title: "Two alerts in one notice",
    steps: [
      {
        alert: [
          post("Eithan's Codex", "@cherylaurelia blocked: should the call API return 202 or 200? Waiting on your answer before I wire the client."),
          post("Aidan's Claude", `needs approval (req ${R.two}): Bash npx prisma migrate dev in yc-hacky`),
        ],
        played: false,
        expect: (t, ok) => {
          const s = said(t);
          ok(/eithan/i.test(s) && /aidan/i.test(s), `names both agents (said: ${s})`);
          ok(sentences(s) <= 3, "at most three sentences");
          ok(asks(s), "ends by asking what to do");
          ok(!t.calls.length, "calls no tool");
        },
      },
      {
        say: "Allow the migration.",
        expect: (t, ok) => {
          const c = calls(t, "answer_request");
          ok(c.length === 1 && strArg(c[0], "decision") === "allow" && strArg(c[0], "request_id") === R.two, "answers allow for the migration's request id");
          ok(!calls(t, "board_post").length, "does not post a relay to Eithan");
        },
      },
    ],
  },
  {
    id: "mention-alert",
    title: "Plain @all mention (not blocked), user needs no reply",
    steps: [
      {
        alert: [post("Aidan's Claude", "@all heads up, I'm merging the login branch in 10 minutes. Shout if that breaks anything for you.")],
        played: false,
        expect: (t, ok) => {
          const s = said(t);
          ok(/aidan/i.test(s), `names Aidan's Claude (said: ${s})`);
          ok(sentences(s) <= 2, "at most two short sentences");
          ok(!t.calls.length, "calls no tool");
        },
      },
      {
        say: "No, that's fine.",
        expect: (t, ok) => {
          ok(!wrote(t).length, "posts nothing");
          ok(said(t), "acknowledges");
        },
      },
    ],
  },
  {
    id: "out-of-scope",
    title: "Out of scope: merge a pull request, then push to main",
    steps: [
      {
        say: ["Merge pull request number 5.", "Can you merge the open PR for me?"],
        expect: (t, ok) => {
          ok(!wrote(t).length, "writes nothing");
          ok(/can't|cannot|can not|unable|not able|don't|do not|yet/i.test(said(t)), `declines (said: ${said(t)})`);
          ok(!/\bmerged\b(?! yet)/i.test(said(t).replace(/can't merge|cannot merge/gi, "")), "does not claim it merged");
        },
      },
      {
        say: "Then just push the fix straight to main.",
        expect: (t, ok) => {
          ok(!wrote(t).length, "writes nothing");
          ok(/can't|cannot|can not|unable|not able|don't|do not|yet/i.test(said(t)), `declines (said: ${said(t)})`);
        },
      },
    ],
  },
];
