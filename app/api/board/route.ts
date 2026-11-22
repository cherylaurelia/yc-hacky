import { checkWrite, resolveToken, sameOrigin } from "@/lib/auth";
import { createBoard } from "@/lib/board-api";
import { readJson } from "@/lib/body";
import { GhError } from "@/lib/github";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";

const fail = (status: number, error: string) => Response.json({ error }, { status });

// POST { repo } -> { number, created }: opens the repo's board issue as the signed-in user, or
// returns the one it already has.
export async function POST(req: Request) {
  const limited = rateLimit(req, "write");
  if (limited) return limited;
  const read = await readJson(req, 1024);
  if (!read.ok) return read.res;
  const parsed = parseRepo((read.body as { repo?: unknown } | null)?.repo);
  if (!parsed.ok) return fail(400, parsed.error);

  const { token, session } = await resolveToken(req);
  if (session && !sameOrigin(req)) return fail(403, "Writes as you have to come from the Terminal 1 page.");
  try {
    await assertReadable(parsed.repo, { signedIn: !!session });
    if (!(await checkWrite(parsed.repo, session))) {
      return fail(403, session ? `You don't have write access to ${parsed.repo}, so you can't create its board.` : "Sign in with GitHub to create the board.");
    }
    return Response.json(await createBoard(parsed.repo, token));
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.status === 404 ? `I could not find ${parsed.repo}. Check the name.` : e.message);
    console.error("board create failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong creating the board.");
  }
}
