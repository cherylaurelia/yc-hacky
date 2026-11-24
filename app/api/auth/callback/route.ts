import { oauthApp, safeNext, sessionSecret } from "@/lib/auth";
import { GhError, gh } from "@/lib/github";
import { OAUTH_COOKIE, SESSION_COOKIE, SESSION_SECONDS, cookieHeader, readCookie, seal } from "@/lib/session";

// GET /api/auth/callback?code&state -> sets the session cookie and returns to the page, or goes
// back to "/app?auth_error=<code>" (the codes are explained in components/AccountControl.tsx).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clearState = cookieHeader(OAUTH_COOKIE, "", 0, "/api/auth");
  const done = (to: string, session?: string) => {
    const h = new Headers({ Location: to, "Cache-Control": "no-store" });
    h.append("Set-Cookie", clearState);
    if (session) h.append("Set-Cookie", session);
    return new Response(null, { status: 302, headers: h });
  };
  const fail = (code: string, detail?: string) => {
    if (detail) console.error(`sign-in failed (${code}): ${detail}`);
    return done(`/app?auth_error=${code}`);
  };

  const app = oauthApp();
  const secret = sessionSecret();
  if (!app || !secret) return fail("not_configured");
  if (q.get("error")) return fail("denied");

  const [state, ...rest] = (readCookie(req, OAUTH_COOKIE) ?? "").split(".");
  const code = q.get("code");
  if (!state || !code || state !== q.get("state")) return fail("state_mismatch");
  const next = safeNext(Buffer.from(rest.join("."), "base64url").toString());

  let res: Response;
  try {
    res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "repo-coworker" },
      body: JSON.stringify({ client_id: app.id, client_secret: app.secret, code }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (e) {
    return fail("github_unreachable", e instanceof Error ? e.message : "unknown error");
  }
  const granted = (await res.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
  if (!res.ok || typeof granted?.access_token !== "string") return fail("exchange_failed", `HTTP ${res.status} ${String(granted?.error ?? "")}`);
  const token = granted.access_token;

  try {
    const u = await gh<{ login?: unknown; name?: unknown; avatar_url?: unknown }>("/user", { token });
    if (typeof u.login !== "string") return fail("profile_failed", "no login in /user");
    const session = { token, login: u.login, name: typeof u.name === "string" ? u.name : null, avatar: typeof u.avatar_url === "string" ? u.avatar_url : "" };
    return done(next, cookieHeader(SESSION_COOKIE, await seal(session, secret), SESSION_SECONDS));
  } catch (e) {
    if (e instanceof GhError) return fail("profile_failed", e.message);
    throw e;
  }
}
