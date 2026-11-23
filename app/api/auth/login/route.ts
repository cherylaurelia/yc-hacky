import { oauthApp, safeNext } from "@/lib/auth";
import { OAUTH_COOKIE, cookieHeader } from "@/lib/session";

const go = (to: string, cookie?: string) =>
  new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });

// GET /api/auth/login[?next=/path] -> GitHub's consent page. Scopes: `repo` to read your repos, post to
// your agent board and file issues as you; `read:user` for your name and avatar.
export async function GET(req: Request) {
  const app = oauthApp();
  if (!app) return go("/app?auth_error=not_configured");

  const next = Buffer.from(safeNext(new URL(req.url).searchParams.get("next") ?? "")).toString("base64url");
  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
  const q = new URLSearchParams({ client_id: app.id, scope: "repo read:user", state });
  return go(`https://github.com/login/oauth/authorize?${q}`, cookieHeader(OAUTH_COOKIE, `${state}.${next}`, 600, "/api/auth"));
}
