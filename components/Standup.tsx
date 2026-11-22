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
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={busy || !repo}
          className="rounded-2xl bg-emerald-500 px-6 py-3 text-lg font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Recording the standup..." : standup ? "Play it again" : `Play the ${hours}-hour standup`}
        </button>
        <span className="text-sm text-zinc-500">Each agent reports in its own voice.</span>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-base text-red-300">
          {error}
        </p>
      )}
      {standup && (
        <>
          <audio key={standup.url} src={standup.url} controls autoPlay className="w-full" />
          <ol className="flex flex-col gap-2">
            {standup.lines.map((l, i) => (
              <li key={i} className="text-base leading-relaxed text-zinc-200">
                <span className="mr-2 font-semibold text-emerald-400">{l.speaker}</span>
                <span className="mr-2 text-xs uppercase tracking-wider text-zinc-600">{l.voice}</span>
                {l.text}
              </li>
            ))}
          </ol>
          <p className="text-xs text-zinc-600">
            {standup.mode === "dialogue" ? "Multi-speaker dialogue (eleven_v3)." : "One text-to-speech clip per line, stitched together."}
          </p>
        </>
      )}
    </section>
  );
}
