"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import AccountControl, { useAccount } from "@/components/AccountControl";
import RepoPicker, { RepoChip } from "@/components/RepoPicker";
import Standup from "@/components/Standup";
import { type Phase, useCoworker } from "@/components/useCoworker";
import type { Alert } from "@/lib/alerts";
import { diffRows } from "@/lib/diff";
import { ago } from "@/lib/spoken";
import { voiceFor } from "@/lib/voices";

// Each poster keeps one colour everywhere, keyed by the voice they speak in. All pass AA with white text.
const VOICE_COLOR: Record<string, string> = {
  Roger: "#3b6788",
  Sarah: "#a84c73",
  Charlie: "#477552",
  Alice: "#7d58ab",
  George: "#94591f",
  Jessica: "#2a7474",
};
const INK = "#221d17";
const colorOf = (who: string) => (who === "coworker" || who === "you" ? INK : (VOICE_COLOR[voiceFor(who).name] ?? INK));
const firstName = (who: string) => who.replace(/[[\]]/g, "").split(/['’\s]/)[0] || who;
const isLocalhost = () => typeof window !== "undefined" && /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

const PILL_WORD: Record<Phase, string> = { idle: "", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

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
    agents,
    open,
    card,
    speaker,
    focus,
    standup,
    draft,
    repo: { current: repo, ready },
    meterSource: source,
    actions: { start, press, send, setDraft, setRepo, setStandup, setFocus, answer, dismiss, endSession },
  } = useCoworker({ initialRepo, board, embed });

  const account = useAccount();
  const captions = msgs.slice(-2);
  const behind = card ? open.length - 1 : 0;

  return (
    <div className={`relative flex flex-col ${embed ? "h-screen overflow-hidden px-4 pb-4 pt-3" : "min-h-screen px-6 pb-8 pt-5 sm:px-10"}`}>
      <header className="flex items-start justify-between gap-4 text-[13px] text-soft">
        <span className="shrink-0 font-display text-base text-ink">Coworker</span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {boardError && <span className="text-stop">{boardError}</span>}
          {embed ? (
            repo && (
              <span className="max-w-[10rem] truncate" title={repo}>
                {repo.split("/")[1]}
              </span>
            )
          ) : (
            <>
              <RepoChip repo={repo} repos={account.repos} loading={account.loadingRepos} onPick={setRepo} />
              <AccountControl account={account} />
            </>
          )}
        </div>
      </header>

      <main className={`mx-auto flex w-full flex-1 flex-col items-center ${embed ? "min-h-0 max-w-sm justify-safe-center overflow-y-auto py-3" : "max-w-xl justify-center py-10"}`}>
        {ready && !repo ? (
          <div className="flex w-full flex-col gap-4">
            <h1 className={`font-display text-balance leading-tight text-ink ${embed ? "text-2xl" : "text-4xl"}`}>Which repo are your agents working in?</h1>
            <RepoPicker repos={account.repos} loading={account.loadingRepos} onPick={setRepo} />
          </div>
        ) : card ? (
          <AlertCard
            key={card.seq}
            alert={card}
            behind={behind}
            embed={embed}
            pttHint={hint.replace(/ to talk$/, "").replace(/^H/, "h")}
            showDiff={focus?.seq === card.seq}
            onShow={(on) => setFocus(on ? card.seq : null)}
            onAnswer={(d) => answer(card, d)}
            onDismiss={() => dismiss(card.id)}
          />
        ) : (
          repo && (
            <section className="flex w-full flex-col items-center gap-7 text-center calm-in">
              <h1 className={`font-display text-balance leading-[1.12] tracking-[-0.01em] text-ink ${embed ? "text-[1.6rem]" : "text-[2.6rem] sm:text-5xl"}`}>
                {agents.length > 1
                  ? `All ${agents.length} agents are working.`
                  : agents.length === 1
                    ? `${agents[0].name} is working.`
                    : "Your agents are working."}
              </h1>
              <p className={`-mt-3 text-soft ${embed ? "text-sm" : "text-base"}`}>I&rsquo;ll speak up if one needs you.</p>
              {agents.length > 0 && (
                <ul className="flex flex-wrap justify-center gap-2" aria-label="Agents on the board">
                  {agents.map((a) => (
                    <li key={a.name} className="flex items-center gap-2 rounded-full bg-card/70 py-1 pl-1 pr-3 text-[13px] text-ink shadow-[0_1px_2px_rgba(60,40,20,0.06)]">
                      <Avatar who={a.name} size={22} />
                      {a.name}
                    </li>
                  ))}
                </ul>
              )}
              {!embed && standup && (
                <div className="mt-4 w-full text-left">
                  <Standup repo={repo} board={board} hours={3} />
                </div>
              )}
            </section>
          )
        )}
      </main>

      {repo && (
        <footer className="flex flex-col items-center gap-3">
          <div aria-live="polite" className={`flex w-full flex-col items-center gap-1 text-center ${embed ? "max-w-sm" : "max-w-lg"}`}>
            {captions.map((m, i) => (
              <p
                key={m.id}
                className={`text-balance ${i === captions.length - 1 ? "max-h-40 overflow-y-auto text-ink" : "line-clamp-1 text-faint"} ${m.role === "user" ? "text-soft" : ""} ${embed ? "text-[13px]" : "text-[15px]"}`}
              >
                {m.role === "user" && <span className="sr-only">You: </span>}
                {m.text}
              </p>
            ))}
          </div>

          {error && (
            <p role="alert" className="max-w-md text-balance text-center text-[13px] text-stop">
              {error}
              {canType && !live && (
                <button type="button" onClick={() => start(true)} className="ml-2 font-semibold underline underline-offset-4">
                  Type instead
                </button>
              )}
            </p>
          )}

          {live && textOnly ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              className="flex w-full max-w-md items-center gap-2 rounded-full bg-ink p-1.5 pl-5"
            >
              <label htmlFor="draft" className="sr-only">
                Message
              </label>
              <input
                id="draft"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type to your coworker"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-paper outline-none placeholder:text-paper/60"
              />
              <button type="submit" disabled={!draft.trim()} className="h-9 rounded-full bg-paper px-4 text-sm font-semibold text-ink disabled:opacity-40">
                Send
              </button>
            </form>
          ) : (
            <button
              type="button"
              data-phase={phase}
              data-mic={mic}
              aria-label={hint}
              onPointerDown={(e) => {
                e.preventDefault();
                press("pointer", true);
              }}
              onContextMenu={(e) => e.preventDefault()}
              className={`pill flex h-11 touch-none select-none items-center gap-3 rounded-full bg-ink pl-4 pr-5 text-paper [-webkit-touch-callout:none] ${phase === "idle" ? "" : "pill-on"}`}
            >
              <VoiceMeter source={source} color={speaker ? (speaker === "you" ? "#f3eee6" : lighten(colorOf(speaker))) : "#f3eee6"} />
              <span className="text-[13px] font-medium tracking-[0.01em]" aria-live="polite">
                {phase === "idle" ? (mic === "muted" ? "Mic muted" : hint) : phase === "speaking" && speaker && speaker !== "coworker" ? firstName(speaker) : PILL_WORD[phase]}
                <span className="sr-only">. {sub}</span>
              </span>
            </button>
          )}

          {!embed && (
            <nav className="flex items-center gap-5 text-[13px] text-soft">
              <button type="button" onClick={() => setStandup((s) => !s)} aria-expanded={standup} className="underline-offset-4 hover:text-ink hover:underline">
                Standup
              </button>
              {live ? (
                <button type="button" onClick={endSession} className="underline-offset-4 hover:text-ink hover:underline">
                  End session
                </button>
              ) : (
                !connecting && (
                  <button type="button" onClick={() => setRepo("")} className="underline-offset-4 hover:text-ink hover:underline">
                    Change repo
                  </button>
                )
              )}
            </nav>
          )}
        </footer>
      )}

      {!embed && <p className="mt-6 text-center text-[12px] text-faint">Built at YC × ElevenLabs Hackathon</p>}
    </div>
  );
}

function Avatar({ who, size }: { who: string; size: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: colorOf(who), fontSize: size * 0.45 }}
    >
      {firstName(who).charAt(0).toUpperCase()}
    </span>
  );
}

// A plain-English sentence for the card's headline.
function headline(a: Alert): string {
  const c = a.ctx;
  const file = c?.file?.split("/").pop();
  if (a.kind === "approval") return c?.command ? `${a.from} wants to run a command.` : file ? `${a.from} wants to edit ${file}.` : `${a.from} needs your OK.`;
  if (a.kind === "stuck") return `${a.from} keeps failing at the same step.`;
  return a.text.replace(/^(?:blocked|needs approval[^:]*|stuck):\s*/i, "");
}

function AlertCard({
  alert: a,
  behind,
  embed,
  pttHint,
  showDiff,
  onShow,
  onAnswer,
  onDismiss,
}: {
  alert: Alert;
  behind: number;
  embed: boolean;
  pttHint: string;
  showDiff: boolean;
  onShow: (on: boolean) => void;
  onAnswer: (d: "allow" | "deny" | "stop") => void;
  onDismiss: () => void;
}) {
  const c = a.ctx;
  const stuck = a.kind === "stuck";
  const rows = c?.diff ? diffRows(c.diff) : [];
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<{ state: "busy" | "ok" | "error"; text: string } | null>(null);

  const act = async (d: "allow" | "deny" | "stop") => {
    setBusy(true);
    try {
      await onAnswer(d);
    } finally {
      setBusy(false);
    }
  };

  async function openInEditor() {
    if (!c?.cwd || !c.file) return;
    setOpening({ state: "busy", text: "Opening" });
    try {
      const res = await fetch("/api/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cwd: c.cwd, file: c.file, line: c.line }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Could not open it (HTTP ${res.status}).`);
      setOpening({ state: "ok", text: "Opened in your editor" });
    } catch (e) {
      setOpening({ state: "error", text: e instanceof Error ? e.message : "Could not open it." });
    }
  }

  const btn = `rounded-full font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-50 ${embed ? "h-10 flex-1 px-4 text-sm" : "h-12 px-7 text-[15px]"}`;

  return (
    <div className="relative w-full">
      {behind > 0 && !embed && (
        <>
          <div aria-hidden className="stack-layer absolute inset-x-6 -bottom-2.5 top-2.5 rounded-[28px]" />
          {behind > 1 && <div aria-hidden className="stack-layer absolute inset-x-12 -bottom-5 top-5 rounded-[28px] opacity-70" />}
        </>
      )}
      <article
        data-alert={a.state}
        data-kind={a.kind ?? a.why}
        aria-label={`${a.from} needs you`}
        className={`card-rise relative flex flex-col rounded-[28px] bg-card ${embed ? "gap-3 p-4" : "gap-5 p-7"} ${stuck ? "ring-1 ring-stop/35" : ""}`}
      >
        <div className="flex items-center gap-2.5 text-[13px]">
          <Avatar who={a.from} size={embed ? 22 : 26} />
          <span className="text-soft">{ago(a.at)}</span>
          {stuck && c?.stuck && (
            <span className="ml-auto rounded-full bg-stoptint px-2.5 py-0.5 font-semibold tabular-nums text-stop">
              {c.stuck.minutes} min · ~${Math.round(c.stuck.cost_usd)}
            </span>
          )}
        </div>

        <h2 className={`font-display text-balance leading-[1.15] tracking-[-0.01em] text-ink ${embed ? "text-xl" : "text-[2rem]"}`}>{headline(a)}</h2>

        {(c?.command || c?.stuck?.signature) && (
          <code className={`self-start break-all rounded-xl bg-chip px-3 py-1.5 font-mono text-ink ${embed ? "text-xs" : "text-[13px]"}`}>{c?.command ?? c?.stuck?.signature}</code>
        )}

        {(rows.length > 0 || c?.file) && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              {rows.length > 0 && (
                <button type="button" onClick={() => onShow(!showDiff)} aria-expanded={showDiff} className="font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                  {showDiff ? "Hide the change" : "Show me the change"}
                </button>
              )}
              {c?.file && (
                <span className="truncate font-mono text-xs text-soft">
                  {c.file}
                  {c.line ? `:${c.line}` : ""}
                </span>
              )}
              {!embed && isLocalhost() && c?.cwd && c.file && (
                <button type="button" onClick={openInEditor} disabled={opening?.state === "busy"} className="text-soft underline-offset-4 hover:text-ink hover:underline">
                  Open in editor
                </button>
              )}
              {opening && <span className={opening.state === "error" ? "text-stop" : "text-soft"}>{opening.text}</span>}
            </div>
            {showDiff && rows.length > 0 && (
              <div className={`diff-open overflow-auto rounded-2xl bg-paper py-2 font-mono ${embed ? "max-h-28 text-[11px] leading-5" : "max-h-72 text-[12.5px] leading-6"}`} data-diff>
                {rows
                  .filter((r) => r.kind !== "meta")
                  .map((r, i) => (
                    <div key={i} data-row={r.kind} className={`flex min-w-max px-3 ${r.kind === "add" ? "bg-addtint text-add" : r.kind === "del" ? "bg-stoptint text-stop" : r.kind === "hunk" ? "text-faint" : "text-ink/80"}`}>
                      <span className="w-4 shrink-0 select-none">{r.kind === "add" ? "+" : r.kind === "del" ? "-" : ""}</span>
                      <span className="whitespace-pre pr-4">{r.text}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-2.5 ${embed ? "" : "pt-1"}`}>
          {a.req && stuck ? (
            <>
              <button type="button" disabled={busy} onClick={() => act("stop")} className={`${btn} bg-stop text-white hover:bg-stop/90`}>
                Stop it
              </button>
              <button type="button" onClick={onDismiss} className={`${btn} text-ink hover:bg-paper`}>
                Let it run
              </button>
            </>
          ) : a.req ? (
            <>
              <button type="button" disabled={busy} onClick={() => act("allow")} className={`${btn} bg-ink text-paper hover:bg-ink/90`}>
                Allow
              </button>
              <button type="button" disabled={busy} onClick={() => act("deny")} className={`${btn} text-ink hover:bg-paper`}>
                Deny
              </button>
              {!embed && (
                <button type="button" disabled={busy} onClick={() => act("stop")} className={`${btn} ml-auto text-soft hover:bg-stoptint hover:text-stop`}>
                  Stop agent
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={onDismiss} className={`${btn} bg-ink text-paper hover:bg-ink/90`}>
              Got it
            </button>
          )}
        </div>
        {!embed && (
          <p className="-mt-1 text-[13px] text-soft">
            or {pttHint} and say {a.req ? (stuck ? "“stop it”" : "“allow”") : "what to tell them"}
          </p>
        )}
      </article>
      {behind > 0 && <p className={`relative text-center text-[13px] text-soft ${embed ? "mt-2" : behind > 1 ? "mt-8" : "mt-6"}`}>{behind} more waiting</p>}
    </div>
  );
}

// Mix a voice colour toward white so it reads on the ink pill.
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.45);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// Resting bar heights: a still voice shape when nobody is talking (and always under reduced motion).
const REST = [0.25, 0.4, 0.6, 0.35, 0.8, 0.5, 0.3, 0.65, 0.45, 0.25];

// Bars driven by the live ElevenLabs audio (the agent while it speaks, your mic otherwise).
// Writes heights straight to the DOM each frame so React never re-renders at 60 fps.
function VoiceMeter({ source, color }: { source: (() => Uint8Array) | null; color: string }) {
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const n = REST.length;
  useEffect(() => {
    const rest = () => els.current.forEach((b, i) => b && (b.style.transform = `scaleY(${REST[i]})`));
    if (!source || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rest();
      return;
    }
    let raf = 0;
    const loop = () => {
      const data = source();
      els.current.forEach((b, i) => {
        if (!b) return;
        const v = data.length ? data[Math.floor((i / n) * data.length * 0.5)] / 255 : 0;
        b.style.transform = `scaleY(${Math.max(0.15, Math.min(1, v * 1.4))})`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      rest();
    };
  }, [source, n]);

  return (
    <span className="flex h-4 items-center gap-[3px]" aria-hidden>
      {REST.map((h, i) => (
        <span
          key={i}
          ref={(el) => {
            els.current[i] = el;
          }}
          className="h-full w-[2.5px] origin-center rounded-full transition-[background-color] duration-300"
          style={{ transform: `scaleY(${h})`, background: color }}
        />
      ))}
    </span>
  );
}
