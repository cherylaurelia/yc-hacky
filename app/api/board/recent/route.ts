import { resolveToken } from "@/lib/auth";
import { answeredFrom, parsePost, type Comment } from "@/lib/board";
import { boardNumber, tokenOwner } from "@/lib/board-api";
import { gh, GhError } from "@/lib/github";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";

const fail = (status: number, error: string) => Response.json({ error }, { status });

// GET /api/board/recent?repo=owner/name[&board=<issue>][&minutes=180][&limit=40]
// -> { me, board, posts: Post[] (oldest first), answered: req ids that already have a reply }.
// Read-only. Used by the Chrome extension's queue (extension/popup.js).
export async function GET(req: Request) {
  const limited = rateLimit(req, "board");
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const parsed = parseRepo(q.get("repo"));
  if (!parsed.ok) return fail(400, parsed.error);
  const given = q.get("board") ? Number(q.get("board")) : undefined;
  if (given !== undefined && !(Number.isInteger(given) && given > 0)) return fail(400, "board must be an issue number.");
  const minutes = q.has("minutes") ? Number(q.get("minutes")) : 180;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return fail(400, "minutes must be a whole number from 1 to 1440.");
  const limit = q.has("limit") ? Number(q.get("limit")) : 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail(400, "limit must be a whole number from 1 to 100.");

  const { token, session } = await resolveToken(req);
  try {
    await assertReadable(parsed.repo, { signedIn: !!session });
    const repo = parsed.repo;
    const board = await boardNumber(repo, token, given);
    const [issue, me] = await Promise.all([
      gh<{ comments: number }>(`/repos/${repo}/issues/${board}`, { token }),
      tokenOwner(token).then((o) => o.login, () => null),
    ]);
    // Newest pages first, at most two (200 comments), stopping once the window is covered.
    const cutoff = Date.now() - minutes * 60_000;
    const rows: Comment[] = [];
    for (let page = Math.ceil(issue.comments / 100), i = 0; page >= 1 && i < 2; page--, i++) {
      const got = await gh<Comment[]>(`/repos/${repo}/issues/${board}/comments?per_page=100&page=${page}`, { token });
      rows.unshift(...got);
      if (got.length && Date.parse(got[0].created_at) < cutoff) break;
    }
    const recent = rows.filter((c) => Date.parse(c.created_at) >= cutoff);
    const posts = recent.map((c) => parsePost(c, me)).slice(-limit);
    return Response.json({ me, board, posts, answered: [...new Set(answeredFrom(recent))] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.message);
    console.error("board recent failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong reading the board.");
  }
}
