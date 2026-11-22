import { resolveToken } from "@/lib/auth";
import { NoBoard, boardUpdates } from "@/lib/board-api";
import { gh, GhError } from "@/lib/github";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";
import { audited, clip } from "@/lib/trace";

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
    const t0 = Date.now();
    const updates = await boardUpdates(parsed.repo, token, board, cursor);
    // The audit trail starts here: one span per poll that found an alert or an answer. Quiet polls leave none.
    const { alerts, answered } = updates;
    if (alerts.length || answered.length) {
      const list = (xs: (string | null)[]) => xs.filter(Boolean).join(",");
      await audited("board.alert", { repo: parsed.repo, user: session?.login, alerts: alerts.length, from: list(alerts.map((x) => x.from)), kinds: list(alerts.map((x) => x.kind)), requests: list(alerts.map((x) => x.req)), answered: list(answered) }, async (a) => {
        a.set({ input: alerts.map((x) => ({ from: x.from, kind: x.kind, req: x.req, text: clip(x.text, 200) })), attrs: { detect_ms: Date.now() - t0 } });
      });
    }
    return Response.json(updates);
  } catch (e) {
    if (e instanceof NoBoard) return Response.json({ error: e.message, code: "no_board" }, { status: 404 });
    if (e instanceof GhError) return fail(e.status, e.status === 404 ? `I could not find ${parsed.repo}. Check the name, or sign in if it is private.` : e.message);
    console.error("board poll failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong checking the board.");
  }
}
