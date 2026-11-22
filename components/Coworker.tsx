"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import AgentLog from "@/components/AgentLog";
import AccountControl, { type Account, useAccount } from "@/components/AccountControl";
import RepoPicker, { RepoChip } from "@/components/RepoPicker";
import TextChat from "@/components/TextChat";
import { type Phase, useCoworker } from "@/components/useCoworker";
import type { Alert } from "@/lib/alerts";
import { diffRows } from "@/lib/diff";
import { type Interruptions, QUIET_MS, endQuiet, goQuiet } from "@/lib/interruptions";
import { ago, plural } from "@/lib/spoken";
import { COWORKER_VOICE, type Voice, voiceFor } from "@/lib/voices";

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

const MODE_LABEL = { all: "All updates", blockers: "Blockers only" } as const;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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
    status: { phase, sub, hint, mic, live, textOnly, canType, error, board: boardState, madeBoard, gesture },
    transcript: msgs,
    agents,
    open,
    card,
    speaker,
    focus,
    settings: { interruptions, voiceId, voices, queued, offered },
    repo: { current: repo, ready },
    meterSource: source,
    actions: { start, press, send, setRepo, setFocus, answer, dismiss, createBoard, setInterruptions, setVoice, readQueued, holdQueued },
  } = useCoworker({ initialRepo, board, embed });

  const account = useAccount();
  const [settings, setSettings] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const captions = msgs.slice(-1);
  const quiet = interruptions.mode === "dnd" ? interruptions : null;
  const behind = card ? open.length - 1 : 0;

  return (
    <div className={`relative flex flex-col ${embed ? "h-screen overflow-hidden px-4 pb-4 pt-3" : "min-h-screen px-6 pb-8 pt-5 sm:px-10"}`}>
      <header className="flex items-start justify-between gap-4 text-[13px] text-soft">
        <span className="shrink-0 font-display text-base text-ink">Terminal 1</span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {quiet && (
            <span role="status" className="rounded-full bg-chip px-3 py-0.5 font-semibold text-ink">
              Do Not Disturb{queued > 0 ? ` · ${plural(queued, "agent")} waiting` : ""}
            </span>
          )}
          <button type="button" onClick={() => setSettings((o) => !o)} aria-expanded={settings} aria-controls="settings" className="underline-offset-4 hover:text-ink hover:underline">
            Settings
          </button>
          {repo && (
            <button type="button" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen} aria-controls="agent-log" className="underline-offset-4 hover:text-ink hover:underline">
              Log
            </button>
          )}
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

      {settings && (
        <SettingsPanel
          embed={embed}
          interruptions={interruptions}
          queued={queued}
          voiceId={voiceId}
          voices={voices}
          live={live}
          onInterruptions={setInterruptions}
          onVoice={setVoice}
          onClose={() => setSettings(false)}
        />
      )}
      {logOpen && repo && <AgentLog repo={repo} board={board} embed={embed} onClose={() => setLogOpen(false)} />}

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
            needsGesture={!gesture}
            showDiff={focus?.seq === card.seq}
            onShow={(on) => setFocus(on ? card.seq : null)}
            onAnswer={(d) => answer(card, d)}
            onDismiss={() => dismiss(card.id)}
          />
        ) : (
          repo && (
            <section className={`flex w-full flex-col items-center text-center calm-in ${embed ? "gap-4" : "gap-6"}`} key={boardState.kind}>
              <h1 className={`font-display text-balance leading-[1.12] tracking-[-0.01em] text-ink ${embed ? "text-[1.6rem]" : "text-[2.6rem] sm:text-5xl"}`}>
                {boardState.kind === "checking"
                  ? "Looking for your agents…"
                  : boardState.kind === "none"
                    ? `No agents connected to ${repo.split("/")[1]} yet.`
                    : boardState.kind === "error"
                      ? `Can't open ${repo.split("/")[1]}.`
                      : agents.length > 1
                        ? `All ${agents.length} agents are working.`
                        : agents.length === 1
                          ? `${agents[0].name} is working.`
                          : "Your agents are working."}
              </h1>
              {boardState.kind === "ok" && (
                <p className={`text-soft ${embed ? "text-sm" : "text-base"}`}>
                  {quiet
                    ? `Do Not Disturb ${quiet.quietUntil === null ? "until you turn it off" : `until ${clock(quiet.quietUntil)}`}. Blockers wait here.`
                    : interruptions.mode === "blockers"
                      ? "I’ll speak up if one is blocked."
                      : "I’ll speak up if one needs you."}
                </p>
              )}
              {boardState.kind === "error" && (
                <p role="alert" className={`max-w-md text-balance text-stop ${embed ? "text-sm" : "text-base"}`}>
                  {boardState.message}
                </p>
              )}
              {boardState.kind === "error" && account.ready && !account.user && /sign in/i.test(boardState.message) && (
                <button type="button" onClick={account.signIn} className="h-11 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98]">
                  Sign in with GitHub
                </button>
              )}
              {boardState.kind === "none" && (
                <>
                  <p className={`max-w-md text-balance text-soft ${embed ? "text-sm" : "text-base"}`}>Agents tell me what they need on a board in this repo. Connect them, then create the board.</p>
                  <ConnectAgents boardNo={madeBoard} open />
                  <CreateBoard account={account} onCreate={createBoard} />
                </>
              )}
              {boardState.kind === "ok" && agents.length === 0 && !embed && <ConnectAgents boardNo={madeBoard} />}
            </section>
          )
        )}
      </main>

      {repo && (
        <footer className="flex flex-col items-center gap-3">
          {offered && (
            <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl bg-card px-4 py-2.5 text-[13px] text-ink shadow-[0_1px_2px_rgba(60,40,20,0.06)]">
              <span>{plural(queued, "agent")} waiting on you. Read them one at a time?</span>
              <button type="button" onClick={readQueued} className="h-8 rounded-full bg-ink px-4 font-semibold text-paper hover:bg-ink/90">
                Read them
              </button>
              <button type="button" onClick={holdQueued} className="h-8 rounded-full px-3 font-semibold text-ink hover:bg-paper">
                Not now
              </button>
            </div>
          )}
          {!(live && textOnly) && (
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
          )}

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
            <TextChat messages={msgs} onSend={send} />
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

        </footer>
      )}

      {!embed && <p className="mt-6 text-center text-[12px] text-faint">Built at YC × ElevenLabs Hackathon</p>}
    </div>
  );
}

const INSTALL = "gh api repos/cherylaurelia/yc-hacky/contents/hooks/install.sh -H 'Accept: application/vnd.github.raw' | bash";

// A command on one line with a button that copies it. If the browser refuses the clipboard, the
// command is selected so Cmd+C works.
function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const code = useRef<HTMLElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      if (code.current) window.getSelection()?.selectAllChildren(code.current);
      setState("selected");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <div className="flex w-full flex-col items-stretch gap-2 rounded-2xl bg-chip p-3 text-left sm:flex-row sm:items-center">
      <code ref={code} className="min-w-0 flex-1 select-all break-all font-mono text-[12.5px] leading-5 text-ink">
        {command}
      </code>
      <button type="button" onClick={copy} className="h-9 shrink-0 rounded-full bg-ink px-4 text-[13px] font-semibold text-paper transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98]">
        {state === "copied" ? "Copied" : state === "selected" ? "Press Cmd+C" : "Copy"}
      </button>
    </div>
  );
}

// The one-time hook install, as a quiet disclosure on the calm page and open when there is no board yet.
function ConnectAgents({ boardNo, open = false }: { boardNo: number | null; open?: boolean }) {
  return (
    <details open={open} data-connect className="w-full text-left text-[13px] text-soft [&[open]>summary]:mb-3">
      <summary className="cursor-pointer select-none text-center font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">Connect your agents</summary>
      <div className="flex flex-col gap-3">
        <p>Run this once on the computer where your agents run, then restart them.</p>
        <CopyCommand command={INSTALL} />
        {boardNo !== null && boardNo !== 1 && (
          <>
            <p>Your board is issue #{boardNo}. Set this in the same terminal.</p>
            <CopyCommand command={`export COWORKER_BOARD=${boardNo}`} />
          </>
        )}
      </div>
    </details>
  );
}

function CreateBoard({ account, onCreate }: { account: Account; onCreate: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!account.ready) return null;
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await onCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the board.");
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        data-create-board
        disabled={busy}
        onClick={account.user ? go : account.signIn}
        className="h-11 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Creating…" : account.user ? "Create the board" : "Sign in to create the board"}
      </button>
      {error && (
        <p role="alert" className="max-w-md text-balance text-[13px] text-stop">
          {error}
        </p>
      )}
    </div>
  );
}

// Interruptions and Coworker's voice. Both save in this browser as soon as they change.
function SettingsPanel({
  embed,
  interruptions,
  queued,
  voiceId,
  voices,
  live,
  onInterruptions,
  onVoice,
  onClose,
}: {
  embed: boolean;
  interruptions: Interruptions;
  queued: number;
  voiceId: string;
  voices: readonly Voice[];
  live: boolean;
  onInterruptions: (s: Interruptions) => void;
  onVoice: (id: string) => void;
  onClose: () => void;
}) {
  const quiet = interruptions.mode === "dnd" ? interruptions : null;
  const pick = "h-9 rounded-full px-4 text-[13px] font-semibold transition-colors";
  return (
    <section
      id="settings"
      aria-label="Settings"
      className={`card-rise mx-auto mt-3 flex w-full flex-col rounded-[28px] bg-card text-[14px] text-ink ${embed ? "max-h-[70vh] max-w-sm gap-4 overflow-y-auto p-4" : "max-w-xl gap-5 p-6"}`}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-display text-lg">Interruptions</legend>
        {(["all", "blockers"] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-start gap-3">
            <input type="radio" name="interruptions" checked={!quiet && interruptions.mode === m} onChange={() => onInterruptions({ mode: m })} className="mt-1 accent-[var(--ink)]" />
            <span>
              <span className="block font-semibold">{MODE_LABEL[m]}</span>
              <span className="text-soft">
                {m === "all" ? "Blockers and milestones, like a PR ready, are read aloud." : "Only questions and approval requests that are holding up agents. Milestones wait for the standup."}
              </span>
            </span>
          </label>
        ))}
        <div className="flex items-start gap-3">
          <span aria-hidden className={`mt-1 size-3.5 shrink-0 rounded-full border ${quiet ? "border-ink bg-ink" : "border-faint"}`} />
          <div className="flex flex-col gap-2">
            <span className="font-semibold">Do Not Disturb</span>
            <span className="text-soft">Nothing speaks on its own. Blockers stay queued, and push to talk still works.</span>
            {quiet ? (
              <div className="flex flex-wrap items-center gap-3" role="status">
                <span>
                  On {quiet.quietUntil === null ? "until you turn it off" : `until ${clock(quiet.quietUntil)}`}. {queued ? `${plural(queued, "agent")} waiting.` : "No agents waiting."}
                </span>
                <button type="button" onClick={() => onInterruptions(endQuiet(interruptions))} className={`${pick} bg-ink text-paper hover:bg-ink/90`}>
                  Turn off, back to {MODE_LABEL[quiet.previousMode]}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onInterruptions(goQuiet(interruptions, Date.now(), QUIET_MS))} className={`${pick} bg-ink text-paper hover:bg-ink/90`}>
                  Quiet for 30 minutes
                </button>
                <button type="button" onClick={() => onInterruptions(goQuiet(interruptions, Date.now(), null))} className={`${pick} bg-chip text-ink hover:bg-line`}>
                  Until I turn it off
                </button>
              </div>
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="coworker-voice" className="font-display text-lg">
          Terminal 1&rsquo;s voice
        </label>
        <select id="coworker-voice" value={voiceId} onChange={(e) => onVoice(e.target.value)} className="h-10 max-w-60 rounded-full border border-line bg-paper px-4 text-ink">
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.id === COWORKER_VOICE.id ? " (default)" : ""}
            </option>
          ))}
        </select>
        <p className="text-soft">Only Terminal 1&rsquo;s own voice changes. Each agent keeps its own voice in alerts and the standup.{live ? " Your next session uses the new voice." : ""}</p>
      </div>

      <button type="button" onClick={onClose} className="self-start text-[13px] text-soft underline-offset-4 hover:text-ink hover:underline">
        Close
      </button>
    </section>
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
  needsGesture,
  showDiff,
  onShow,
  onAnswer,
  onDismiss,
}: {
  alert: Alert;
  behind: number;
  embed: boolean;
  pttHint: string;
  needsGesture: boolean;
  showDiff: boolean;
  onShow: (on: boolean) => void;
  onAnswer: (d: "allow" | "deny" | "stop") => void;
  onDismiss: () => void;
}) {
  const c = a.ctx;
  const stuck = a.kind === "stuck";
  const rows = c?.diff ? diffRows(c.diff) : [];
  const [busy, setBusy] = useState(false);

  const act = async (d: "allow" | "deny" | "stop") => {
    setBusy(true);
    try {
      await onAnswer(d);
    } finally {
      setBusy(false);
    }
  };

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
            </>
          ) : (
            <button type="button" onClick={onDismiss} className={`${btn} bg-ink text-paper hover:bg-ink/90`}>
              Got it
            </button>
          )}
        </div>
        {needsGesture ? (
          <p className="-mt-1 text-[13px] text-soft">Click anywhere to hear your agents</p>
        ) : (
          !embed && (
            <p className="-mt-1 text-[13px] text-soft">
              or {pttHint} and say {a.req ? (stuck ? "“stop it”" : "“allow”") : "what to tell them"}
            </p>
          )
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
