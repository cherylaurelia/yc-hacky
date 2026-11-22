export class GhError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Opts = { token?: string; method?: string; body?: unknown };

// Plain fetch wrapper. Errors are short sentences the voice agent can say aloud.
export async function gh<T = unknown>(path: string, { token, method = "GET", body }: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "repo-coworker",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new GhError(timeout ? "GitHub took too long to answer." : "I could not reach GitHub.", 504);
  }
  if (res.ok) return (res.status === 204 ? null : await res.json()) as T;

  const text = await res.text().catch(() => "");
  const apiMessage = (() => {
    try {
      return String(JSON.parse(text).message ?? "");
    } catch {
      return "";
    }
  })();
  if (res.status === 401) throw new GhError("GitHub rejected the access token.", 502);
  if (res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(apiMessage)))) {
    throw new GhError("GitHub is rate limiting us. Try again in a minute.", 429);
  }
  if (res.status === 403) throw new GhError("I am not allowed to do that on this repo.", 403);
  if (res.status === 404) throw new GhError("I could not find that. The repo or item may not exist, or I may not have access.", 404);
  if (res.status === 409) throw new GhError("That repo has no commits yet.", 409);
  if (res.status === 410) throw new GhError("Issues are turned off for this repo.", 410);
  if (res.status === 422) throw new GhError(`GitHub refused that. ${apiMessage}`.trim().slice(0, 200), 422);
  throw new GhError(`GitHub returned an error ${res.status}.`, 502);
}
