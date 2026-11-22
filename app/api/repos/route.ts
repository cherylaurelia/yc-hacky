import { sessionFrom } from "@/lib/auth";
import { GhError, gh } from "@/lib/github";

const fail = (status: number, error: string) => Response.json({ error }, { status });

// GET /api/repos -> { repos: [{ name: "owner/name", private }] }: the signed-in user's 30 most
// recently pushed repos (their own, ones they collaborate on, and their orgs').
export async function GET(req: Request) {
  const s = await sessionFrom(req);
  if (!s) return fail(401, "Sign in with GitHub to pick one of your repos.");
  try {
    const rows = await gh<{ full_name: string; private: boolean }[]>(
      "/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=30",
      { token: s.token },
    );
    return Response.json({ repos: rows.map((r) => ({ name: r.full_name, private: r.private })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GhError) return fail(e.status, e.message);
    console.error("repo list failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong listing your repos.");
  }
}
