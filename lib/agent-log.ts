// The agent log: every issue agents raised on the board (approval requests, blocked and stuck
// agents) and, on request, the tasks they were given. Pure, so the route and the tests share it.
import { type Comment, type Post, answeredFrom, parsePost } from "./board.ts";

export type IssueKind = "approval" | "blocked" | "stuck";
// open: still waiting. answered: a "req <id> allow|deny|stop" reply exists. resolved: a blocked
// post with no request id, after which the same agent posted again.
export type IssueStatus = "open" | "answered" | "resolved";
export type LogIssue = { id: number; agent: string; login: string; kind: IssueKind; text: string; at: string; req: string | null; status: IssueStatus };

// waiting: nobody picked it up yet. working: the agent said "on it". done / blocked: its last word.
export type TaskStatus = "waiting" | "working" | "done" | "blocked";
export type LogTask = { id: number; for: string; from: string; fromLogin: string; text: string; at: string; status: TaskStatus; updated: string | null; pr: number | null };

export type AgentLog = { issues: LogIssue[]; tasks?: LogTask[] };

const TASK = /\bTASK for ([^:\n]{1,60}):\s*([\s\S]+)/i;
const ON_IT = /^\s*(?:@[\w-]+[\s,:]*)*on it\b/i;
const DONE = /^\s*(?:@[\w-]+[\s,:]*)*done\b/i;
const BLOCKED = /^\s*(?:@[\w-]+[\s,:]*)*blocked\b/i;
const PR = /\bPRs? #(\d+)/i;
// Typed issue posts start with their kind; hook posts carry it in their context block. Other posts
// that merely mention "blocks" or "needs approval" are not issues.
const ISSUE_START = /^\s*(?:needs approval|blocked|stuck)\b/i;
const MENTION = /^\s*(?:\[[^\]\n]*\]\s*)?((?:@[\w-]+[\s,:]*)+)/;
const ISSUE_KINDS = new Set<string>(["approval", "blocked", "stuck"]);

// "Cheryl’s Claude" and "cheryl's  claude" are the same agent.
export const sameAgent = (a: string, b: string) => {
  const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
};

export function issuesFrom(posts: Post[], answered: ReadonlySet<string>): LogIssue[] {
  const out: LogIssue[] = [];
  posts.forEach((p, i) => {
    if (p.relay || !p.kind || !ISSUE_KINDS.has(p.kind) || TASK.test(p.text)) return;
    if (!p.ctx?.kind && !ISSUE_START.test(p.text)) return;
    let status: IssueStatus = "open";
    if (p.req) status = answered.has(p.req) ? "answered" : "open";
    else if (posts.slice(i + 1).some((q) => !q.relay && sameAgent(q.agent, p.agent))) status = "resolved";
    out.push({ id: p.id, agent: p.agent, login: p.login, kind: p.kind as IssueKind, text: p.text, at: p.at, req: p.req, status });
  });
  return out;
}

// Logins a post @mentions at its start, as in "[Cheryl's Claude] @EithanY-Coder done: ...".
export const mentionsOf = (body: string): string[] => (body.match(MENTION)?.[1].match(/@[\w-]+/g) ?? []).map((m) => m.slice(1).toLowerCase());

// Each "on it" / "done" / "blocked" from an agent moves one of its unfinished tasks posted before it:
// the oldest one from the person the reply @mentions, else the oldest one (workers go in order).
// `mentions[i]` are the logins post i mentions (parsePost strips them from the text).
export function tasksFrom(posts: Post[], mentions: string[][] = []): LogTask[] {
  const tasks: LogTask[] = [];
  posts.forEach((p, i) => {
    const m = p.text.match(TASK);
    if (m && !sameAgent(p.agent, m[1])) {
      tasks.push({ id: p.id, for: m[1].trim(), from: p.agent, fromLogin: p.login, text: m[2].trim(), at: p.at, status: "waiting", updated: null, pr: null });
      return;
    }
    const next = ON_IT.test(p.text) ? "working" : DONE.test(p.text) ? "done" : BLOCKED.test(p.text) ? "blocked" : null;
    if (!next) return;
    const mine = tasks.filter((x) => sameAgent(x.for, p.agent) && (next === "working" ? x.status === "waiting" : x.status === "waiting" || x.status === "working"));
    const to = mentions[i] ?? [];
    const t = mine.find((x) => to.includes(x.fromLogin.toLowerCase())) ?? mine[0];
    if (!t) return;
    t.status = next;
    t.updated = p.at;
    const pr = p.text.match(PR);
    if (pr) t.pr = Number(pr[1]);
  });
  return tasks;
}

// Comments oldest first in; entries newest first out.
export function buildLog(comments: Comment[], login: string | null, { tasks = false } = {}): AgentLog {
  const posts = comments.map((c) => parsePost(c, login));
  const answered = new Set(answeredFrom(comments));
  const log: AgentLog = { issues: issuesFrom(posts, answered).reverse() };
  if (tasks) log.tasks = tasksFrom(posts, comments.map((c) => mentionsOf(c.body))).reverse();
  return log;
}
