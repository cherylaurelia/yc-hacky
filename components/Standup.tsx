"use client";

import { useEffect, useState } from "react";

type Line = { speaker: string; voice: string; text: string };
type Standup = { url: string; lines: Line[]; mode: string };

// Self-contained: <Standup repo="owner/name" hours={3} />. One click builds the standup on the
// server (GET /api/standup), plays it, and shows each line under its speaker. Pass `board`
// to read a board issue other than the repo's pinned one.
export default function Standup({ repo, hours = 3, board }: { repo: string; hours?: number; board?: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standup, setStandup] = useState<Standup | null>(null);

  useEffect(() => () => { if (standup) URL.revokeObjectURL(standup.url); }, [standup]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({ repo, hours: String(hours), ...(board ? { board: String(board) } : {}) });
      const res = await fetch(`/api/standup?${q}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Standup failed (HTTP ${res.status}).`);
      }
      const header = res.headers.get("X-Standup-Script");
      if (!header) throw new Error("The standup came back without a script.");
      const lines = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(header), (c) => c.charCodeAt(0)))) as Line[];
      setStandup({ url: URL.createObjectURL(await res.blob()), lines, mode: res.headers.get("X-Standup-Mode") ?? "dialogue" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the standup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={busy || !repo}
          className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Recording the standup..." : standup ? "Play it again" : `Play the ${hours}-hour standup`}
        </button>
              </div>
      {error && (
        <p role="alert" className="text-sm text-stop">
          {error}
        </p>
      )}
      {standup && (
        <>
          <audio key={standup.url} src={standup.url} controls autoPlay className="h-10 w-full" />
          <ol className="flex flex-col gap-2">
            {standup.lines.map((l, i) => (
              <li key={i} className="text-[15px] leading-relaxed text-ink">
                <span className="mr-2 font-semibold">{l.speaker}</span>
                {l.text}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
