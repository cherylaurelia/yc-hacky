// Signed-in user, as an encrypted cookie (AES-GCM, Web Crypto, keyed from SESSION_SECRET), plus
// the write-permission decision. No imports, so node --test runs it directly (lib/session.test.ts).
export type Session = { token: string; login: string; name: string | null; avatar: string };

export const SESSION_COOKIE = "coworker_session";
export const OAUTH_COOKIE = "coworker_oauth";
export const SESSION_SECONDS = 30 * 24 * 3600;

const enc = new TextEncoder();

const aesKey = async (secret: string) =>
  crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]);

// base64url(iv + ciphertext). The expiry lives inside the encrypted payload, so it cannot be edited.
export async function seal(session: Session, secret: string, now = Date.now()): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = enc.encode(JSON.stringify({ ...session, exp: now + SESSION_SECONDS * 1000 }));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), payload));
  return Buffer.concat([iv, sealed]).toString("base64url");
}

// null for anything that is not a live session we sealed: garbage, tampering, wrong secret, expired.
export async function unseal(value: string, secret: string, now = Date.now()): Promise<Session | null> {
  const raw = Buffer.from(value, "base64url");
  if (raw.length < 12 + 16) return null;
  const plain = await crypto.subtle
    .decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12) }, await aesKey(secret), raw.subarray(12))
    .catch(() => null);
  if (!plain) return null;
  const s = JSON.parse(new TextDecoder().decode(plain)) as Partial<Session> & { exp?: number };
  if (typeof s.token !== "string" || typeof s.login !== "string" || typeof s.avatar !== "string" || typeof s.exp !== "number" || s.exp <= now) return null;
  return { token: s.token, login: s.login, name: typeof s.name === "string" ? s.name : null, avatar: s.avatar };
}

export function cookieHeader(name: string, value: string, maxAge: number, path = "/"): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

// ---------- who may write ----------

const PUSH_TTL_MS = 60_000;
const pushCache = new Map<string, { push: boolean; until: number }>();

// Signed in: only if the user can push to the repo (the write goes out as them, so GitHub
// enforces it too). Signed out: only repos on the WRITE_REPOS list, which write as the server token.
export async function canWrite(
  repo: string,
  session: Pick<Session, "token" | "login"> | null,
  writeRepos: string | undefined,
  canPush: (repo: string, token: string) => Promise<boolean>,
  now = Date.now(),
): Promise<boolean> {
  if (!session) return (writeRepos ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean).includes(repo.toLowerCase());
  const key = `${session.login}/${repo}`.toLowerCase();
  const hit = pushCache.get(key);
  if (hit && hit.until > now) return hit.push;
  const push = await canPush(repo, session.token);
  for (const [k, v] of pushCache) if (v.until <= now) pushCache.delete(k);
  pushCache.set(key, { push, until: now + PUSH_TTL_MS });
  return push;
}
