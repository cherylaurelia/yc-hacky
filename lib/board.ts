// Agent-board logic with no server imports, so the route, the browser and
// scripts/text-chat.ts all share it. A board post is a GitHub issue comment
// that starts with a tag like "[Aidan's Claude]" (see AGENTS.md).
import { ago, clip, plain, plural } from "./spoken.ts";

export type Kind = "approval" | "blocked" | "done" | "stuck";
export type Stuck = { count: number; minutes: number; cost_usd: number; signature: string };
// The invisible block hooks add to a post: <!-- coworker:{"v":1,...} -->. Every field is optional.
export type Ctx = { kind?: Kind; req?: string; session?: string; agent?: string; cwd?: string; repo?: string; tool?: string; command?: string; file?: string; line?: number; diff?: string; stuck?: Stuck };

export type Comment = { id: number; user: { login: string } | null; body: string; created_at: string };
export type Post = { id: number; login: string; agent: string; text: string; at: string; mention: boolean; blocked: boolean; relay: boolean; kind: Kind | null; req: string | null; ctx: Ctx | null };
export type BoardAlert = { id: number; from: string; login: string; why: "blocked" | "mention"; text: string; at: string; kind: Kind | null; req: string | null; ctx: Ctx | null };
export type BoardCursor = { since: number; at: string };

const TAG = /^\s*\[([^\]\n]{1,60})\]\s*/;
const COMMENT = /<!--[\s\S]*?-->/g;
const CTX = /<!--\s*coworker:(\{[\s\S]*?\})\s*-->/;
const KINDS = new Set<string>(["approval", "blocked", "done", "stuck"]);
const REQ = /^[0-9a-f]{4,12}$/i;
const MAX_DIFF = 30_000;
// "waiting on CI" is not news. "waiting on your answer" is.
const BLOCKED = /\b(?:blocked|awaiting|stuck|waiting (?:on|for)(?! (?:the )?(?:ci|build|builds|tests?|deploy|deploys|install)\b)|needs? (?:your )?(?:approval|decision|input|answer))\b/i;
// A reply to a request: "req ab12cd allow", optionally behind a tag and an @mention.
const ANSWER = /^\s*(?:\[[^\]\n]*\]\s*)?(?:@[\w-]+[\s,:]*)?req\s+([0-9a-f]{4,12})\s+(?:allow|approved?|yes|deny|denied|no|reject(?:ed)?|stop)\b/i;

const str = (v: unknown, max = 2000) => (typeof v === "string" && v ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// The context block of a post, or null when it has none, is not JSON, or is not an object.
export function parseContext(body: string): Ctx | null {
  const m = body.match(CTX);
  if (!m) return null;
  let j: Record<string, unknown>;
  try {
    const p: unknown = JSON.parse(m[1]);
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    j = p as Record<string, unknown>;
  } catch {
    return null;
  }
  if (j.v !== undefined && j.v !== 1) return null;
  const s = j.stuck && typeof j.stuck === "object" ? (j.stuck as Record<string, unknown>) : null;
  const count = num(s?.count);
  const minutes = num(s?.minutes);
  const line = num(j.line);
  const req = str(j.req, 12);
  return {
    kind: typeof j.kind === "string" && KINDS.has(j.kind) ? (j.kind as Kind) : undefined,
    req: req && REQ.test(req) ? req.toLowerCase() : undefined,
    session: str(j.session, 80),
    agent: str(j.agent, 60),
    cwd: str(j.cwd, 500),
    repo: str(j.repo, 100),
    tool: str(j.tool, 60),
    command: str(j.command, 2000),
    file: str(j.file, 500),
    line: line && Number.isInteger(line) && line > 0 ? line : undefined,
    diff: str(j.diff, MAX_DIFF),
    stuck: count !== undefined && minutes !== undefined ? { count, minutes, cost_usd: num(s?.cost_usd) ?? 0, signature: str(s?.signature, 200) ?? "" } : undefined,
  };
}

export function parsePost(c: Comment, login: string | null): Post {
  const tag = c.body.match(TAG);
  const agent = tag?.[1] ?? c.user?.login ?? "someone";
  const raw = tag ? c.body.slice(tag[0].length) : c.body;
  const ctx = parseContext(raw);
  // The context block is data, not words: it must not trigger mentions or "blocked" matches.
  const body = raw.replace(COMMENT, " ");
  // Our own relays ("[<login>'s Coworker]") must not alert us about ourselves.
  const relay = /\bCoworker$/i.test(agent);
  const mention = !relay && new RegExp(`(?:^|[^A-Za-z0-9_-])@(?:all${login ? `|${login}` : ""})(?![A-Za-z0-9_-])`, "i").test(body);
  const blocked = !relay && (ctx?.kind ? ctx.kind !== "done" : BLOCKED.test(body));
  const kind = ctx?.kind ?? (/\bneeds approval\b/i.test(body) ? "approval" : /\bstuck:/i.test(body) ? "stuck" : blocked ? "blocked" : null);
  return {
    id: c.id,
    login: c.user?.login ?? "someone",
    agent,
    text: plain(body).replace(/^(?:@[\w-]+[\s,:]*)+/, "").replace(/@(?=\w)/g, ""),
    at: c.created_at,
    mention,
    blocked,
    relay,
    kind,
    req: ctx?.req ?? body.match(/\(req ([0-9a-f]{4,12})\)/i)?.[1].toLowerCase() ?? null,
    ctx,
  };
}

export const alertsFrom = (posts: Post[]): BoardAlert[] =>
  posts
    .filter((p) => p.mention || p.blocked)
    .map((p) => ({ id: p.id, from: p.agent, login: p.login, why: p.blocked ? "blocked" : "mention", text: clip(p.text, 300), at: p.at, kind: p.kind, req: p.req, ctx: p.ctx }));

// Request ids that already have a reply ("req ab12cd allow") in these comments.
export const answeredFrom = (comments: Comment[]): string[] => comments.flatMap((c) => c.body.match(ANSWER)?.[1].toLowerCase() ?? []);

const stop = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
const list = (xs: string[], max: number) => stop(xs.length > max ? `${xs.slice(0, max).join("; ")}; and ${xs.length - max} more` : xs.join("; "));

// Spoken digest of posts already filtered to the window, oldest first.
export function digest(posts: Post[], minutes: number, user: string | null): string {
  const window = minutes < 120 ? plural(minutes, "minute") : plural(Math.round(minutes / 60), "hour");
  if (!posts.length) return `The board has been quiet for the last ${window}. No agent has posted.`;
  const by = new Map<string, Post[]>();
  for (const p of posts) by.set(p.agent, [...(by.get(p.agent) ?? []), p]);
  const said = (p: Post) => `${p.agent}, ${ago(p.at)}: ${clip(p.text, 120)}`;

  const asks = posts.filter((p) => p.mention).reverse();
  const stuck = posts.filter((p) => p.blocked && !p.mention).reverse();
  const head = [`In the last ${window}, ${plural(by.size, "agent")} posted ${plural(posts.length, "time")}.`];
  if (asks.length) head.push(`Mentioning ${user ? "you" : "the team"}: ${list(asks.map(said), 3)}`);
  if (stuck.length) head.push(`Blocked or waiting: ${list(stuck.map(said), 3)}`);

  const rows = [...by]
    .sort((a, b) => b[1].at(-1)!.id - a[1].at(-1)!.id)
    .map(([agent, ps]) => {
      const done = ps.filter((p) => !p.blocked && !p.mention).slice(-2).map((p) => clip(p.text, 90));
      return stop(`${agent}, ${plural(ps.length, "post")}${done.length ? `, latest: ${done.reverse().join("; ")}` : ""}`);
    });
  let out = head.join(" ");
  for (const [i, r] of rows.entries()) {
    if (out.length + r.length + 1 > 1130) return `${out} Plus ${plural(rows.length - i, "more agent")}.`;
    out += ` ${r}`;
  }
  return clip(out, 1200);
}

// One alert as the line the agent reads. Stuck numbers and the req id come along as digits so the
// agent never has to dig them out of prose.
const alertLine = (a: BoardAlert) => {
  const s = a.ctx?.stuck;
  const extra = [s && `Retried ${plural(s.count, "time")} over ${plural(s.minutes, "minute")}, about ${Math.round(s.cost_usd)} dollars.`, a.req && !a.text.includes(a.req) && `Request id ${a.req}.`].filter(Boolean);
  return `${a.from} (GitHub login ${a.login}) ${a.why === "blocked" ? "is blocked or waiting" : "mentioned the user"}: "${a.text}"${extra.length ? ` ${extra.join(" ")}` : ""}`;
};

// The text injected into the live conversation. The agent prompt says to treat
// the [BOARD ALERT] prefix as a system notice.
export const alertMessage = (alerts: BoardAlert[]) => `[BOARD ALERT] ${alerts.map(alertLine).join("\n")}`;

// The repo is fine but nothing there is a board yet.
export class NoBoardError extends Error {}

// Browser and Node client for GET /api/board/new. First call (no cursor) only
// returns the baseline cursor; later calls return alerts for newer posts, plus the request
// ids that got an answer on the board.
export async function pollBoard(repo: string, cursor?: BoardCursor, base = "", board?: number): Promise<{ cursor: BoardCursor; alerts: BoardAlert[]; answered: string[] }> {
  const q = new URLSearchParams({ repo, ...(board ? { board: String(board) } : {}), ...(cursor ? { since: String(cursor.since), at: cursor.at } : {}) });
  const res = await fetch(`${base}/api/board/new?${q}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const j = (await res.json().catch(() => ({}))) as { cursor?: BoardCursor; alerts?: BoardAlert[]; answered?: string[]; error?: string; code?: string };
  if (j.code === "no_board") throw new NoBoardError(j.error ?? "This repo has no agent board yet.");
  if (!res.ok || !j.cursor || !j.alerts) throw new Error(j.error ?? `Board check failed (HTTP ${res.status}).`);
  return { cursor: j.cursor, alerts: j.alerts, answered: j.answered ?? [] };
}
