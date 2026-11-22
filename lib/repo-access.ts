import { GhError, gh } from "./github.ts";

const TTL = 5 * 60_000;
const MAX_CACHED = 500;
const seen = new Map<string, { isPrivate: boolean; until: number }>();

// DEMO_REPOS is the operator's list of private repos that are fine to show to anyone.
const demoRepos = () => (process.env.DEMO_REPOS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

// Without a sign-in the server's own GitHub token may only read public repos and the demo list.
// Pass signedIn once a session exists, because GitHub then decides what that person can see.
// Throws a GhError the routes already turn into a spoken-friendly reply.
export async function assertReadable(repo: string, { signedIn = false } = {}, now = Date.now()): Promise<void> {
  const key = repo.toLowerCase();
  if (signedIn || demoRepos().includes(key)) return;

  let hit = seen.get(key);
  if (!hit || hit.until < now) {
    const r = await gh<{ private: boolean }>(`/repos/${repo}`, { token: process.env.GITHUB_TOKEN || undefined });
    hit = { isPrivate: r.private !== false, until: now + TTL };
    seen.delete(key);
    seen.set(key, hit);
    if (seen.size > MAX_CACHED) seen.delete(seen.keys().next().value!);
  }
  if (hit.isPrivate) throw new GhError("Sign in with GitHub to use a private repo.", 403);
}
