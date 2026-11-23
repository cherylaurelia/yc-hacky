// Server side of "Sign in with GitHub": which token a request uses and whether it may write.
// Setup: register a GitHub OAuth App with callback URL <origin>/api/auth/callback, then put its
// GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET plus SESSION_SECRET (`openssl rand -base64 32`) in .env.local.
import { gh } from "./github";
import { type Session, SESSION_COOKIE, canWrite, readCookie, unseal } from "./session";

// 32+ characters: `openssl rand -base64 32`.
export const sessionSecret = () => {
  const s = process.env.SESSION_SECRET ?? "";
  return s.length >= 32 ? s : null;
};

export const oauthApp = () => {
  const id = process.env.GITHUB_CLIENT_ID?.trim();
  const secret = process.env.GITHUB_CLIENT_SECRET?.trim();
  return id && secret && sessionSecret() ? { id, secret } : null;
};

// A same-site path to return to after sign-in, never another site.
export const safeNext = (s: string) => (/^\/(?![/\\])[^\r\n]{0,500}$/.test(s) ? s : "/");

export async function sessionFrom(req: Request): Promise<Session | null> {
  const secret = sessionSecret();
  const value = readCookie(req, SESSION_COOKIE);
  return secret && value ? unseal(value, secret) : null;
}

// The signed-in user's token first. Without a session, the server token, which routes only
// let read (writes are checked by checkWrite).
export async function resolveToken(req: Request): Promise<{ token: string | undefined; session: Session | null }> {
  const session = await sessionFrom(req);
  return { token: session?.token ?? (process.env.GITHUB_TOKEN || undefined), session };
}

export const checkWrite = (repo: string, session: Session | null) =>
  canWrite(repo, session, process.env.WRITE_REPOS, async (r, token) => (await gh<{ permissions?: { push?: boolean } }>(`/repos/${r}`, { token })).permissions?.push === true);

export { sameOrigin } from "./origin";
