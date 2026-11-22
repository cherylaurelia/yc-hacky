import { checkWrite, resolveToken, sameOrigin } from "@/lib/auth";
import { GhError } from "@/lib/github";
import { parseRepo } from "@/lib/repo";
import { HANDLERS, isToolName, isWriteTool, validateArgs } from "@/lib/tools";

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isToolName(name)) return fail(404, `I don't have a tool called ${name.slice(0, 40)}.`);

  let body: { repo?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Request body must be JSON.");
  }
  const parsed = parseRepo(body?.repo);
  if (!parsed.ok) return fail(400, parsed.error);
  const checked = validateArgs(name, body.args);
  if (!checked.ok) return fail(400, checked.error);

  const { token, session } = await resolveToken(req);
  if (session && isWriteTool(name) && !sameOrigin(req)) return fail(403, "Writes as you have to come from the Coworker page.");

  try {
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
