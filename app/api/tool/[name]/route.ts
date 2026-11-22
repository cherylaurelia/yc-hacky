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

  if (isWriteTool(name)) {
    const allowed = (process.env.WRITE_REPOS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(parsed.repo.toLowerCase())) {
      return fail(403, "I can read this repo but I can't write to it yet.");
    }
  }

  try {
    const result = await HANDLERS[name]({ repo: parsed.repo, token: process.env.GITHUB_TOKEN || undefined }, checked.args);
    return Response.json({ result });
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.message);
    console.error(`tool ${name} failed:`, e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong running that tool.");
  }
}
