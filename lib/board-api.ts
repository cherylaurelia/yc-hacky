// GitHub side of the agent board: which issue is the board, who the token
// belongs to, and the comment reads and writes the board tools and route use.
import { type BoardAlert, type BoardCursor, type Comment, alertsFrom, answeredFrom, digest, parsePost } from "./board";
import { gh, GhError } from "./github";

const boards = new Map<string, number>();
const owners = new Map<string, { login: string; name: string }>();

// The board is the `board` argument, else env BOARD_ISSUE (every repo), else the open issue
// labeled `board` (the pinned one), else issue 1.
export async function boardNumber(repo: string, token: string | undefined, given?: number): Promise<number> {
  if (given) return given;
  const fromEnv = Number(process.env.BOARD_ISSUE);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  const hit = boards.get(repo);
  if (hit) return hit;
  const rows = await gh<{ number: number; pull_request?: unknown }[]>(`/repos/${repo}/issues?labels=board&state=open&sort=created&direction=asc&per_page=10`, { token });
  const n = rows.find((i) => !i.pull_request)?.number ?? 1;
  boards.set(repo, n);
  return n;
}

// The token owner from GET /user: `login` decides who is mentioned, `name` is the first name shown
// in the relay tag. env OWNER_NAME overrides it for the server token only (a signed-in user is
// always themselves); no profile name falls back to the login.
export async function tokenOwner(token: string | undefined): Promise<{ login: string; name: string }> {
  if (!token) throw new GhError("The board needs a GitHub token on the server.", 502);
  const hit = owners.get(token);
  if (hit) return hit;
  const u = await gh<{ login: string; name: string | null }>("/user", { token });
  const first = u.name?.trim().split(/\s+/)[0] ?? "";
  const me = { login: u.login, name: (token === process.env.GITHUB_TOKEN && process.env.OWNER_NAME?.trim()) || (first && first[0].toUpperCase() + first.slice(1)) || u.login };
  owners.set(token, me);
  return me;
}

const ownerOrNull = (token: string | undefined) => tokenOwner(token).then((o) => o.login, () => null);

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
  const owner = (await tokenOwner(token)).name;
  const n = await boardNumber(repo, token, board);
  await gh(`/repos/${repo}/issues/${n}/comments`, {
    token,
    method: "POST",
    body: { body: `[${owner}'s Coworker] ${to ? `@${to} ` : ""}${text.slice(0, 2000)}` },
  });
  return `Posted to the board${to ? ` for ${to}` : ""}.`;
}

// One cheap call per poll: comments updated since the cursor, keep the ones newer than its id.
export async function boardUpdates(repo: string, token: string | undefined, board: number | undefined, cursor?: BoardCursor): Promise<{ cursor: BoardCursor; alerts: BoardAlert[]; answered: string[] }> {
  const n = await boardNumber(repo, token, board);
  if (!cursor) {
    const issue = await gh<{ comments: number }>(`/repos/${repo}/issues/${n}`, { token });
    if (!issue.comments) return { cursor: { since: 0, at: new Date(Date.now() - 60_000).toISOString() }, alerts: [], answered: [] };
    const [last] = await gh<Comment[]>(`/repos/${repo}/issues/${n}/comments?per_page=1&page=${issue.comments}`, { token });
    // GitHub returns an empty page past its pagination cap (very long threads): start from now instead.
    if (!last) return { cursor: { since: 0, at: new Date().toISOString() }, alerts: [], answered: [] };
    return { cursor: { since: last.id, at: last.created_at }, alerts: [], answered: [] };
  }
  const [rows, user] = await Promise.all([
    gh<Comment[]>(`/repos/${repo}/issues/${n}/comments?per_page=100&since=${encodeURIComponent(cursor.at)}`, { token }),
    ownerOrNull(token),
  ]);
  const fresh = rows.filter((c) => c.id > cursor.since);
  if (!fresh.length) return { cursor, alerts: [], answered: [] };
  const last = fresh[fresh.length - 1];
  return { cursor: { since: last.id, at: last.created_at }, alerts: alertsFrom(fresh.map((c) => parsePost(c, user))).slice(-5), answered: answeredFrom(fresh) };
}
