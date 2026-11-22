"use client";

import { useCallback, useEffect, useState } from "react";

export type SessionUser = { login: string; name: string | null; avatar: string };
type Repo = { name: string; private: boolean };

// Codes the sign-in routes send back as /?auth_error=<code>.
const AUTH_ERRORS: Record<string, string> = {
  not_configured: "GitHub sign-in is not set up on this server yet.",
  denied: "You cancelled the GitHub sign-in.",
  state_mismatch: "That sign-in expired or came from another browser. Try again.",
  github_unreachable: "I could not reach GitHub. Try again in a minute.",
  exchange_failed: "GitHub would not finish the sign-in. Try again.",
  profile_failed: "I signed in but could not read your GitHub profile. Try again.",
};

// Who is signed in (from /api/me), plus the ?auth_error= message the last sign-in attempt left behind.
export function useSession() {
  const [state, setState] = useState<{ user: SessionUser | null; ready: boolean; error: string }>({ user: null, ready: false, error: "" });

  useEffect(() => {
    (async () => {
      let error = "";
      const q = new URLSearchParams(window.location.search);
      const code = q.get("auth_error");
      if (code) {
        error = AUTH_ERRORS[code] ?? "GitHub sign-in failed. Try again.";
        q.delete("auth_error");
        const rest = q.toString();
        history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
      }
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { user: SessionUser | null };
        setState({ user: j.user, ready: true, error });
      } catch {
        setState({ user: null, ready: true, error: error || "I could not check your GitHub sign-in." });
      }
    })();
  }, []);

  const signIn = useCallback(() => {
    const to = new URL("/api/auth/login", window.location.origin);
    to.searchParams.set("next", window.location.pathname + window.location.search);
    window.location.assign(to);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ user: null, ready: true, error: "" });
    } catch {
      setState((s) => ({ ...s, error: "I could not sign you out. Try again." }));
    }
  }, []);

  return { ...state, signIn, signOut };
}

// Unstyled. Signed out: a button and why we ask. Signed in: who you are, sign out, and a picker over
// your 30 most recently pushed repos. Pass `repo` to keep the current one selected.
export default function AccountControl({ repo, onRepo }: { repo?: string; onRepo: (repo: string) => void }) {
  const { user, ready, error, signIn, signOut } = useSession();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoError, setRepoError] = useState("");
  const login = user?.login;

  useEffect(() => {
    if (!login) return;
    (async () => {
      try {
        const res = await fetch("/api/repos", { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { repos?: Repo[]; error?: string };
        if (!res.ok || !j.repos) throw new Error(j.error ?? `HTTP ${res.status}`);
        setRepos(j.repos);
      } catch (e) {
        setRepoError(e instanceof Error ? e.message : "I could not list your repos.");
      }
    })();
  }, [login]);

  if (!ready) return null;

  if (!user) {
    return (
      <div>
        <button type="button" onClick={signIn}>
          Sign in with GitHub
        </button>
        <p>GitHub will ask to let Coworker read your repos, post to your agent board and file issues as you. Nothing else.</p>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {user.avatar && <img src={user.avatar} alt="" width={24} height={24} />}
      <span>{user.login}</span>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
      <label>
        Repo
        <select value={repo ?? ""} onChange={(e) => e.target.value && onRepo(e.target.value)}>
          {(!repo || !repos.some((r) => r.name === repo)) && <option value={repo ?? ""}>{repo || "Pick a repo"}</option>}
          {repos.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
              {r.private ? " (private)" : ""}
            </option>
          ))}
        </select>
      </label>
      {(error || repoError) && <p role="alert">{error || repoError}</p>}
    </div>
  );
}
