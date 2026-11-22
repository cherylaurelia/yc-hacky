export type ParsedRepo = { ok: true; repo: string } | { ok: false; error: string };

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

export function parseRepo(input: unknown): ParsedRepo {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "Enter a repo like owner/name or paste its GitHub link." };
  }
  const raw = input.trim();
  const s = raw.replace(/^git@github\.com:/i, "").replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "");
  const m = s.match(/^([^/?#\s]+)\/([^/?#\s]+)/);
  const owner = m?.[1] ?? "";
  const name = (m?.[2] ?? "").replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..") {
    return { ok: false, error: `"${raw.slice(0, 60)}" is not a GitHub repo. Use owner/name.` };
  }
  return { ok: true, repo: `${owner}/${name}` };
}

const RECENT_KEY = "coworker.recent";
const RECENT_MAX = 8;

// The repos this browser opened last, newest first. Browser only (localStorage).
export function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch (e) {
    console.warn("Could not read the recent repos:", e);
    return [];
  }
}

export function rememberRecent(repo: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([repo, ...readRecent().filter((r) => r.toLowerCase() !== repo.toLowerCase())].slice(0, RECENT_MAX)));
  } catch (e) {
    console.warn("Could not save the recent repos:", e);
  }
}
