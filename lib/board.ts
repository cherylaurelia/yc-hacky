// Agent-board logic with no server imports, so the route, the browser and
// scripts/text-chat.ts all share it. A board post is a GitHub issue comment
// that starts with a tag like "[Aidan's Claude]" (see AGENTS.md).
import { ago, clip, plain, plural } from "./spoken.ts";

export type Comment = { id: number; user: { login: string } | null; body: string; created_at: string };
export type Post = { id: number; login: string; agent: string; text: string; at: string; mention: boolean; blocked: boolean; relay: boolean };
export type BoardAlert = { id: number; from: string; login: string; why: "blocked" | "mention"; text: string; at: string };
export type BoardCursor = { since: number; at: string };

const TAG = /^\s*\[([^\]\n]{1,60})\]\s*/;
// "waiting on CI" is not news. "waiting on your answer" is.
const BLOCKED = /\b(?:blocked|awaiting|stuck|waiting (?:on|for)(?! (?:the )?(?:ci|build|builds|tests?|deploy|deploys|install)\b)|needs? (?:your )?(?:approval|decision|input|answer))\b/i;

export function parsePost(c: Comment, login: string | null): Post {
  const tag = c.body.match(TAG);
  const agent = tag?.[1] ?? c.user?.login ?? "someone";
  const body = tag ? c.body.slice(tag[0].length) : c.body;
  // Our own relays ("[<login>'s Coworker]") must not alert us about ourselves.
  const relay = /\bCoworker$/i.test(agent);
  const mention = !relay && new RegExp(`(?:^|[^A-Za-z0-9_-])@(?:all${login ? `|${login}` : ""})(?![A-Za-z0-9_-])`, "i").test(body);
  return {
    id: c.id,
    login: c.user?.login ?? "someone",
    agent,
    text: plain(body).replace(/^(?:@[\w-]+[\s,:]*)+/, "").replace(/@(?=\w)/g, ""),
    at: c.created_at,
    mention,
    blocked: !relay && BLOCKED.test(body),
    relay,
  };
}

export const alertsFrom = (posts: Post[]): BoardAlert[] =>
  posts
    .filter((p) => p.mention || p.blocked)
    .map((p) => ({ id: p.id, from: p.agent, login: p.login, why: p.blocked ? "blocked" : "mention", text: clip(p.text, 300), at: p.at }));

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

// The text injected into the live conversation. The agent prompt says to treat
// the [BOARD ALERT] prefix as a system notice.
export const alertMessage = (alerts: BoardAlert[]) =>
  `[BOARD ALERT] ${alerts.map((a) => `${a.from} (GitHub login ${a.login}) ${a.why === "blocked" ? "is blocked or waiting" : "mentioned the user"}: "${a.text}"`).join("\n")}`;

// Browser and Node client for GET /api/board/new. First call (no cursor) only
// returns the baseline cursor; later calls return alerts for newer posts.
export async function pollBoard(repo: string, cursor?: BoardCursor, base = ""): Promise<{ cursor: BoardCursor; alerts: BoardAlert[] }> {
  const q = new URLSearchParams({ repo, ...(cursor ? { since: String(cursor.since), at: cursor.at } : {}) });
  const res = await fetch(`${base}/api/board/new?${q}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const j = (await res.json().catch(() => ({}))) as { cursor?: BoardCursor; alerts?: BoardAlert[]; error?: string };
  if (!res.ok || !j.cursor || !j.alerts) throw new Error(j.error ?? `Board check failed (HTTP ${res.status}).`);
  return { cursor: j.cursor, alerts: j.alerts };
}
