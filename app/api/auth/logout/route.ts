import { SESSION_COOKIE, cookieHeader } from "@/lib/session";

// POST /api/auth/logout -> 204 and the session cookie is cleared. The GitHub grant stays until the
// user revokes it at github.com/settings/applications.
export async function POST() {
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookieHeader(SESSION_COOKIE, "", 0), "Cache-Control": "no-store" } });
}
