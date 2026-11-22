// GitHub side of the agent board: which issue is the board, who the token
// belongs to, and the comment reads and writes the board tools and route use.
import { type BoardAlert, type BoardCursor, type Comment, alertsFrom, digest, parsePost } from "./board";
import { gh, GhError } from "./github";

const boards = new Map<string, number>();
const owners = new Map<string, string>();

// The board is the open issue labeled `board` (the pinned one), else issue 1.
export async function boardNumber(repo: string, token: string | undefined, given?: number): Promise<number> {
  if (given) return given;
  const hit = boards.get(repo);
  if (hit) return hit;
  const rows = await gh<{ number: number; pull_request?: unknown }[]>(`/repos/${repo}/issues?labels=board&state=open&sort=created&direction=asc&per_page=10`, { token });
  const n = rows.find((i) => !i.pull_request)?.number ?? 1;
  boards.set(repo, n);
  return n;
}

// GitHub login of the server token, from GET /user.
export async function tokenOwner(token: string | undefined): Promise<string> {
  if (!token) throw new GhError("The board needs a GitHub token on the server.", 502);
  const hit = owners.get(token);
  if (hit) return hit;
  const { login } = await gh<{ login: string }>("/user", { token });
  owners.set(token, login);
  return login;
}

const ownerOrNull = (token: string | undefined) => tokenOwner(token).catch(() => null);

export async function boardDigest(repo: string, token: string | undefined, board: number | undefined, minutes: number): Promise<string> {
  const n = await boardNumber(repo, token, board);
  const [issue, user] = await Promise.all([gh<{ comments: number }>(`/repos/${repo}/issues/${n}`, { token }), ownerOrNull(token)]);
  // Walk back from the newest page (100 posts each) until the window is covered, at most 3 pages.
  const cutoff = Date.now() - minutes * 60_000;
  const rows: Comment[] = [];
  for (let page = Math.ceil(issue.comments / 100), i = 0; page >= 1 && i < 3; page--, i++) {
    const got = await gh<Comment[]>(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${page}`, { token });
    rows.unshift(...got);
    if (got.length && Date.parse(got[0].created_at) < cutoff) break;
  }
  const posts = rows.filter((c) => Date.parse(c.created_at) >= cutoff).map((c) => parsePost(c, user));
  return digest(posts, minutes, user);
}

export async function boardPost(repo: string, token: string | undefined, board: number | undefined, text: string, to: string): Promise<string> {
  const owner = await tokenOwner(token);
  const n = await boardNumber(repo, token, board);
  await gh(`/repos/${repo}/issues/${n}/comments`, {
    token,
    method: "POST",
    body: { body: `[${owner}'s Coworker] ${to ? `@${to} ` : ""}${text.slice(0, 2000)}` },
  });
  return `Posted to the board${to ? ` for ${to}` : ""}.`;
}

// One cheap call per poll: comments updated since the cursor, keep the ones newer than its id.
export async function boardUpdates(repo: string, token: string | undefined, board: number | undefined, cursor?: BoardCursor): Promise<{ cursor: BoardCursor; alerts: BoardAlert[] }> {
  const n = await boardNumber(repo, token, board);
  if (!cursor) {
    const issue = await gh<{ comments: number }>(`/repos/${repo}/issues/${n}`, { token });
    if (!issue.comments) return { cursor: { since: 0, at: new Date(Date.now() - 60_000).toISOString() }, alerts: [] };
    const [last] = await gh<Comment[]>(`/repos/${repo}/issues/${n}/comments?per_page=1&page=${issue.comments}`, { token });
    return { cursor: { since: last.id, at: last.created_at }, alerts: [] };
  }
  const [rows, user] = await Promise.all([
    gh<Comment[]>(`/repos/${repo}/issues/${n}/comments?per_page=100&since=${encodeURIComponent(cursor.at)}`, { token }),
    ownerOrNull(token),
  ]);
  const fresh = rows.filter((c) => c.id > cursor.since);
  if (!fresh.length) return { cursor, alerts: [] };
  const last = fresh[fresh.length - 1];
  return { cursor: { since: last.id, at: last.created_at }, alerts: alertsFrom(fresh.map((c) => parsePost(c, user))).slice(-5) };
}
