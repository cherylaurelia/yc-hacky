import { resolveToken } from "@/lib/auth";
import { boardUpdates } from "@/lib/board-api";
import { gh, GhError } from "@/lib/github";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";

const fail = (status: number, error: string) => Response.json({ error }, { status });

// GET /api/board/new?repo=owner/name[&since=<comment id>&at=<its created_at>][&board=<issue>]
// No `since`: returns the baseline cursor. With `since`: alerts for newer posts. `at` is
// the GitHub `since` time of that comment; without it we look the comment up (one extra call).
export async function GET(req: Request) {
  const limited = rateLimit(req, "board");
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const parsed = parseRepo(q.get("repo"));
  if (!parsed.ok) return fail(400, parsed.error);

  const sinceRaw = q.get("since");
  const board = q.get("board") ? Number(q.get("board")) : undefined;
  if (board !== undefined && !(Number.isInteger(board) && board > 0)) return fail(400, "board must be an issue number.");
  const { token, session } = await resolveToken(req);

  try {
    await assertReadable(parsed.repo, { signedIn: !!session });
    let cursor;
    if (sinceRaw !== null) {
      const since = Number(sinceRaw);
      if (!Number.isInteger(since) || since < 0) return fail(400, "since must be a comment id.");
      let at = q.get("at");
      if (at && Number.isNaN(Date.parse(at))) return fail(400, "at must be an ISO time.");
      if (!at) {
        at = since ? (await gh<{ created_at: string }>(`/repos/${parsed.repo}/issues/comments/${since}`, { token })).created_at : new Date(Date.now() - 60_000).toISOString();
      }
      cursor = { since, at };
    }
    return Response.json(await boardUpdates(parsed.repo, token, board, cursor));
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.message);
    console.error("board poll failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong checking the board.");
  }
}
