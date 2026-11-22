"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { useEffect, useRef } from "react";
import FocusCard from "@/components/FocusCard";
import Standup from "@/components/Standup";
import { type Phase, useCoworker } from "@/components/useCoworker";
import type { AlertState } from "@/lib/alerts";
import { parseRepo } from "@/lib/repo";

// The chip on each alert card: where it is in the line.
const STATE_LABEL: Record<AlertState, string> = { waiting: "waiting", playing: "speaking", asking: "asking", told: "told", answered: "answered" };
const isLocalhost = () => typeof window !== "undefined" && /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

const LOOK: Record<Phase, { box: string; bar: string; word: string }> = {
  idle: { box: "border-line bg-panel", bar: "bg-line", word: "text-text" },
  listening: { box: "border-signal bg-signal/10 shadow-[0_0_56px_-14px] shadow-signal", bar: "bg-signal", word: "text-signal" },
  thinking: { box: "animate-pulse border-warn/70 bg-warn/10", bar: "bg-warn", word: "text-warn" },
  speaking: { box: "border-ok/70 bg-ok/10", bar: "bg-ok", word: "text-ok" },
};

const showArgs = (a: Record<string, unknown>) =>
  Object.entries(a).map(([k, v]) => `${k}: ${String(v)}`).join(", ").slice(0, 110);

export default function Coworker({ initialRepo, board, embed }: { initialRepo: string; board?: number; embed: boolean }) {
  return (
    <ConversationProvider>
      <Panel initialRepo={initialRepo} board={board} embed={embed} />
    </ConversationProvider>
  );
}

// Presentation only: every piece of state and every action comes from useCoworker().
function Panel({ initialRepo, board, embed }: { initialRepo: string; board?: number; embed: boolean }) {
  const {
    status: { phase, sub, hint, mic, live, connecting, textOnly, canType, error, boardError },
    transcript: msgs,
    feed,
    alerts,
    waiting: waitingNow,
    focus: focused,
    standup,
    draft,
    repo: { current: repo, ready, input: repoInput, error: repoError },
    meterSource: source,
    actions: { start, press, send, setDraft, setRepo, setRepoInput, setStandup, setFocus, skip, endSession },
  } = useCoworker({ initialRepo, board, embed });
  const msgEnd = useRef<HTMLDivElement>(null);
  const feedEnd = useRef<HTMLDivElement>(null);
  const look = LOOK[phase];

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs]);
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feed.length]);

  return (
    <div className={embed ? "flex h-screen flex-col gap-3 overflow-hidden p-3" : "mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"}>
      {ready && !repo && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = parseRepo(repoInput);
            if (p.ok) setRepo(p.repo);
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="repo" className="sr-only">
            GitHub repo
          </label>
          <input
            id="repo"
            autoFocus
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            spellCheck={false}
            placeholder="owner/name, then press Enter"
            className="rounded-2xl border border-line bg-panel px-4 py-3 font-mono text-base outline-none placeholder:text-dim/80 focus:border-signal/70"
          />
          {repoError && !repoError.ok && <span className="px-1 text-sm text-warn">{repoError.error}</span>}
        </form>
      )}

      {(live || alerts.length > 0) && (
        <p data-waiting={waitingNow.count} className={`self-center rounded-full border px-3.5 py-1.5 text-sm ${waitingNow.count ? (waitingNow.stuck ? "border-bad/60 bg-bad/10 text-bad" : "border-signal/50 bg-signal/10 text-signal") : "border-line text-dim"}`}>
          Agents waiting on you: <span className="font-semibold tabular-nums">{waitingNow.count}</span>
        </p>
      )}

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          data-phase={phase}
          data-mic={mic}
          disabled={!repo}
          aria-label={hint}
          onPointerDown={(e) => {
            e.preventDefault();
            press("pointer", true);
          }}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative flex w-full max-w-md touch-none select-none flex-col items-center justify-center gap-1 overflow-hidden border-2 transition-colors duration-200 disabled:opacity-50 [-webkit-touch-callout:none] ${embed ? "h-24 rounded-3xl" : "h-44 rounded-[2rem]"} ${look.box}`}
        >
          <VoiceMeter source={source} bars={embed ? 20 : 28} color={look.bar} />
          <span className={`relative font-semibold capitalize tracking-tight ${embed ? "text-2xl" : "text-4xl"} ${look.word}`} aria-live="polite">
            {phase}
          </span>
          <span className="relative text-sm text-text/80">{sub}</span>
        </button>
        {phase !== "idle" || mic === "muted" ? <p className="text-xs text-dim">{hint}</p> : <span className="h-4" />}
      </div>

      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-x-3 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-[#ffc9c9]">
          {error}
          {canType && !live && (
            <button type="button" onClick={() => start(true)} className="underline underline-offset-4 hover:text-text">
              Type instead
            </button>
          )}
        </p>
      )}

      {(live || msgs.length > 0 || feed.length > 0) && (
        <div className={embed ? "flex min-h-0 flex-1 flex-col gap-3" : "grid flex-1 gap-6 md:grid-cols-2"}>
          <section className={`flex min-h-0 flex-col rounded-2xl border border-line bg-panel p-4 ${embed ? "flex-1" : "min-h-72"}`}>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {msgs.length === 0 && <p className="m-auto text-sm text-dim">{textOnly ? "Type a message." : hint}</p>}
              {msgs.map((m) =>
                m.role === "user" ? (
                  <p key={m.id} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-raise px-3.5 py-2 text-base">
                    {m.text}
                  </p>
                ) : (
                  <p key={m.id} className={`max-w-[65ch] leading-snug ${embed ? "text-base" : "text-xl"}`}>
                    {m.text}
                  </p>
                ),
              )}
              <div ref={msgEnd} />
            </div>
            {live && textOnly && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type here"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-3.5 py-2.5 text-base outline-none placeholder:text-dim/80 focus:border-signal/70"
                />
                <button type="submit" disabled={!draft.trim()} className="rounded-xl bg-raise px-4 py-2.5 text-base font-medium transition enabled:hover:bg-line disabled:opacity-40">
                  Send
                </button>
              </form>
            )}
          </section>

          <section className={`flex min-h-0 flex-col rounded-2xl border border-line bg-panel ${embed ? "max-h-40 shrink-0" : "min-h-72"}`}>
            <div className="flex items-center gap-2 px-4 pb-2 pt-3 text-xs text-dim">
              <span className="font-medium uppercase tracking-wider">Activity</span>
              {live && (
                <span className={`ml-auto flex items-center gap-1.5 ${boardError ? "text-warn" : ""}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${boardError ? "bg-warn" : "animate-pulse bg-signal"}`} />
                  {boardError ?? "Watching the board"}
                </span>
              )}
            </div>
            <ol className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
              {feed.length === 0 && <li className="px-4 py-1 text-sm text-dim">GitHub calls and board posts that need you show up here.</li>}
              {feed.map((f) =>
                "a" in f ? (
                  <li
                    key={`a${f.seq}`}
                    data-alert={f.a.state}
                    data-kind={f.a.kind ?? f.a.why}
                    className={`mx-3 my-1.5 rounded-xl border ${f.a.kind === "stuck" ? "border-bad/60 bg-bad/10" : "border-signal/50 bg-signal/10"} ${f.a.state === "answered" ? "opacity-60" : ""}`}
                  >
                    <button type="button" onClick={() => setFocus(f.a.seq)} className="block w-full px-3.5 py-2.5 text-left">
                      <div className={`flex items-center gap-2 text-xs font-semibold ${f.a.kind === "stuck" ? "text-bad" : "text-signal"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full bg-current ${f.a.state === "told" || f.a.state === "answered" || f.a.state === "waiting" ? "" : "animate-pulse"}`} />
                        {f.a.kind === "stuck" ? "Stuck in a loop" : f.a.why === "blocked" ? "Blocked, needs you" : "Mentions you"}
                        <span className="ml-auto rounded-full bg-current/20 px-2 py-0.5 font-medium">{STATE_LABEL[f.a.state]}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold">{f.a.from}</p>
                      <p className="mt-0.5 line-clamp-3 text-sm text-text/85">{f.a.text}</p>
                      {f.a.ctx?.stuck && (
                        <p data-chips className="mt-1.5 flex gap-1.5 text-xs font-semibold tabular-nums text-bad">
                          <span className="rounded-full bg-bad/15 px-2 py-0.5">{f.a.ctx.stuck.count} retries</span>
                          <span className="rounded-full bg-bad/15 px-2 py-0.5">{f.a.ctx.stuck.minutes} min</span>
                          <span className="rounded-full bg-bad/15 px-2 py-0.5">${f.a.ctx.stuck.cost_usd.toFixed(2)}</span>
                        </p>
                      )}
                    </button>
                    {f.a.state === "asking" && (
                      <div className="flex justify-end px-3.5 pb-2">
                        <button type="button" onClick={() => skip(f.a.id)} className="text-xs text-dim underline underline-offset-4 hover:text-text">
                          Skip for now
                        </button>
                      </div>
                    )}
                  </li>
                ) : (
                  <li key={`c${f.seq}`} className="border-t border-line/70 px-4 py-2 first:border-t-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${f.c.state === "running" ? "animate-pulse bg-warn" : f.c.state === "ok" ? "bg-ok" : "bg-bad"}`} />
                      <span className="truncate font-mono text-sm font-medium">{f.c.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-dim">{f.c.ms !== undefined ? `${f.c.ms} ms` : "running"}</span>
                    </div>
                    {Object.keys(f.c.args).length > 0 && <p className="mt-0.5 truncate pl-[18px] font-mono text-xs text-dim">{showArgs(f.c.args)}</p>}
                    {f.c.text && <p className={`mt-0.5 line-clamp-2 pl-[18px] text-sm ${f.c.state === "error" ? "text-bad" : "text-text/80"}`}>{f.c.text}</p>}
                  </li>
                ),
              )}
              <div ref={feedEnd} />
            </ol>
          </section>
        </div>
      )}

      {!embed && repo && (
        <footer className="mt-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-dim">
            <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer" className="font-mono underline-offset-4 hover:text-text hover:underline">
              {repo}
            </a>
            {!live && !connecting && (
              <button type="button" onClick={() => setRepo("")} className="underline underline-offset-4 hover:text-text">
                Change repo
              </button>
            )}
            {live && (
              <button type="button" onClick={endSession} className="underline underline-offset-4 hover:text-bad">
                End session
              </button>
            )}
            <button
              type="button"
              onClick={() => setStandup((s) => !s)}
              className="ml-auto rounded-full border border-line px-4 py-1.5 font-medium text-text/90 transition hover:border-signal hover:text-signal"
            >
              Standup
            </button>
          </div>
          {standup && <Standup repo={repo} board={board} hours={3} />}
        </footer>
      )}

      {focused && <FocusCard alert={focused} onClose={() => setFocus(null)} canOpen={isLocalhost()} />}
    </div>
  );
}

// Bars driven by the live ElevenLabs audio (the agent while it speaks, your mic otherwise).
// Writes heights straight to the DOM each frame so React never re-renders at 60 fps.
function VoiceMeter({ source, bars: n, color }: { source: (() => Uint8Array) | null; bars: number; color: string }) {
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!source) {
      els.current.forEach((b) => b && (b.style.transform = "scaleY(0.06)"));
      return;
    }
    let raf = 0;
    const loop = () => {
      const data = source();
      els.current.forEach((b, i) => {
        if (!b) return;
        const mid = Math.abs(i - (n - 1) / 2) / (n / 2); // 0 at centre, 1 at edges
        const v = data.length ? data[Math.floor((i / n) * data.length * 0.6)] / 255 : 0;
        b.style.transform = `scaleY(${Math.max(0.06, v * (1 - mid * 0.55))})`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [source, n]);

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-30" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            els.current[i] = el;
          }}
          className={`h-full w-1.5 origin-center rounded-full transition-[background-color] duration-300 ${color}`}
          style={{ transform: "scaleY(0.06)" }}
        />
      ))}
    </div>
  );
}
