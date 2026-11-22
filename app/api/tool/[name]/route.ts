import { checkWrite, resolveToken, sameOrigin } from "@/lib/auth";
import { readJson } from "@/lib/body";
import { GhError } from "@/lib/github";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";
import { HANDLERS, isToolName, isWriteTool, validateArgs } from "@/lib/tools";

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const limited = rateLimit(req, "tool");
  if (limited) return limited;
  const { name } = await params;
  if (!isToolName(name)) return fail(404, `I don't have a tool called ${name.slice(0, 40)}.`);

  const read = await readJson(req, 16_384);
  if (!read.ok) return read.res;
  const body = (read.body ?? {}) as { repo?: unknown; args?: unknown };
  const parsed = parseRepo(body.repo);
  if (!parsed.ok) return fail(400, parsed.error);
  const checked = validateArgs(name, body.args);
  if (!checked.ok) return fail(400, checked.error);

  const { token, session } = await resolveToken(req);
  if (session && isWriteTool(name) && !sameOrigin(req)) return fail(403, "Writes as you have to come from the Coworker page.");
  if (isWriteTool(name)) {
    const slowDown = rateLimit(req, "write");
    if (slowDown) return slowDown;
  }

  try {
    await assertReadable(parsed.repo, { signedIn: !!session });
    if (isWriteTool(name) && !(await checkWrite(parsed.repo, session))) {
      return fail(403, session ? `You don't have write access to ${parsed.repo}, so I can't write there as you.` : "I can read this repo but I can't write to it yet. Sign in with GitHub and I'll write as you.");
    }
    const result = await HANDLERS[name]({ repo: parsed.repo, token }, checked.args);
    return Response.json({ result });
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.message);
    console.error(`tool ${name} failed:`, e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong running that tool.");
  }
}
