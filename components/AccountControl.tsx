"use client";

import { useCallback, useEffect, useState } from "react";
import type { Repo } from "@/components/RepoPicker";

export type SessionUser = { login: string; name: string | null; avatar: string };

// Codes the sign-in routes send back as /?auth_error=<code>.
const AUTH_ERRORS: Record<string, string> = {
  not_configured: "Sign-in isn't set up on this server yet. You can still type in any public repo.",
  denied: "You cancelled the GitHub sign-in.",
  state_mismatch: "That sign-in expired or came from another browser. Try again.",
  github_unreachable: "I could not reach GitHub. Try again in a minute.",
  exchange_failed: "GitHub would not finish the sign-in. Try again.",
  profile_failed: "I signed in but could not read your GitHub profile. Try again.",
};

// Who is signed in (from /api/me), the ?auth_error= message the last sign-in attempt left behind,
// and, once signed in, the user's 30 most recently pushed repos (from /api/repos).
export function useAccount() {
  const [state, setState] = useState<{ user: SessionUser | null; ready: boolean; error: string }>({ user: null, ready: false, error: "" });
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState("");
  const login = state.user?.login;

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

  useEffect(() => {
    if (!login) return;
    let stale = false;
    (async () => {
      setLoadingRepos(true);
      try {
        const res = await fetch("/api/repos", { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { repos?: Repo[]; error?: string };
        if (!res.ok || !j.repos) throw new Error(j.error ?? `HTTP ${res.status}`);
        if (!stale) setRepos(j.repos);
      } catch (e) {
        if (!stale) setRepoError(e instanceof Error ? e.message : "I could not list your repos.");
      } finally {
        if (!stale) setLoadingRepos(false);
      }
    })();
    return () => {
      stale = true;
    };
  }, [login]);

  const signIn = useCallback(() => {
    const to = new URL("/api/auth/login", window.location.origin);
    to.searchParams.set("next", window.location.pathname + window.location.search);
    window.location.assign(to);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRepos([]);
      setRepoError("");
      setState({ user: null, ready: true, error: "" });
    } catch {
      setState((s) => ({ ...s, error: "I could not sign you out. Try again." }));
    }
  }, []);

  return { ...state, repos, loadingRepos, repoError, signIn, signOut };
}

export type Account = ReturnType<typeof useAccount>;

// Signed out: a sign-in button. Signed in: who you are and a sign-out button.
export default function AccountControl({ account: { user, ready, error, repoError, signIn, signOut } }: { account: Account }) {
  if (!ready) return null;
  const note = error || repoError;
  return (
    <div data-account className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] text-soft">
      {user ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {user.avatar && <img src={user.avatar} alt="" width={24} height={24} className="rounded-full" />}
          <span>{user.login}</span>
          <button type="button" onClick={signOut} className="font-semibold text-ink underline-offset-4 hover:underline">
            Sign out
          </button>
        </>
      ) : (
        <button type="button" onClick={signIn} className="font-semibold text-ink underline-offset-4 hover:underline">
          Sign in with GitHub
        </button>
      )}
      {note && (
        <p role="alert" className="basis-full text-right text-stop">
          {note}
        </p>
      )}
    </div>
  );
}
