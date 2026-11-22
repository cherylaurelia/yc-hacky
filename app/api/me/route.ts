import { sessionFrom } from "@/lib/auth";

// GET /api/me -> { user: { login, name, avatar } | null }. Read from the cookie, never the token.
export async function GET(req: Request) {
  const s = await sessionFrom(req);
  return Response.json({ user: s && { login: s.login, name: s.name, avatar: s.avatar } }, { headers: { "Cache-Control": "no-store" } });
}
