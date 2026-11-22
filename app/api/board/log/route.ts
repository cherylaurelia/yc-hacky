import { buildLog } from "@/lib/agent-log";
import { resolveToken } from "@/lib/auth";
import type { Comment } from "@/lib/board";
import { boardNumber, tokenOwner } from "@/lib/board-api";
import { gh, GhError } from "@/lib/github";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const MAX_PAGES = 3; // 300 comments, newest first

// GET /api/board/log?repo=owner/name[&hours=12][&tasks=1][&board=<issue>]
// -> { board, hours, issues, tasks? }: every agent issue on the board in the window, newest first,
// and with tasks=1 the TASK posts and how far each got. Read-only. See lib/agent-log.ts.
export async function GET(req: Request) {
  const limited = rateLimit(req, "board");
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const parsed = parseRepo(q.get("repo"));
  if (!parsed.ok) return fail(400, parsed.error);
  const hours = q.has("hours") ? Number(q.get("hours")) : 12;
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) return fail(400, "hours must be a whole number from 1 to 72.");
  const given = q.get("board") ? Number(q.get("board")) : undefined;
  if (given !== undefined && !(Number.isInteger(given) && given > 0)) return fail(400, "board must be an issue number.");
  const tasks = q.get("tasks") === "1";

  const { token, session } = await resolveToken(req);
  try {
    await assertReadable(parsed.repo, { signedIn: !!session });
    const repo = parsed.repo;
    const board = await boardNumber(repo, token, given);
    const [issue, login] = await Promise.all([gh<{ comments: number }>(`/repos/${repo}/issues/${board}`, { token }), tokenOwner(token).then((o) => o.login, () => null)]);
    const cutoff = Date.now() - hours * 3_600_000;
    const rows: Comment[] = [];
    for (let page = Math.ceil(issue.comments / 100), i = 0; page >= 1 && i < MAX_PAGES; page--, i++) {
      const got = await gh<Comment[]>(`/repos/${repo}/issues/${board}/comments?per_page=100&page=${page}`, { token });
      rows.unshift(...got);
      if (got.length && Date.parse(got[0].created_at) < cutoff) break;
    }
    const recent = rows.filter((c) => Date.parse(c.created_at) >= cutoff);
    return Response.json({ board, hours, ...buildLog(recent, login, { tasks }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.message);
    console.error("agent log failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong reading the agent log.");
  }
}
