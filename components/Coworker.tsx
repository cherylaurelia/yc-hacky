"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import agent from "@/agent.json";
import { type BoardAlert, type BoardCursor, alertMessage, pollBoard } from "@/lib/board";
import { localNow } from "@/lib/now";
import { parseRepo } from "@/lib/repo";
import { TOOL_SPECS } from "@/lib/tool-specs";
import Standup from "@/components/Standup";

type Msg = { id: number; role: "user" | "agent"; text: string };
type Alert = BoardAlert & { seq: number };
type Call = { id: number; name: string; args: Record<string, unknown>; state: "running" | "ok" | "error"; text: string; ms?: number };

const EXAMPLES = ["azizu06/hackathon-agent-board", "vercel/next.js"];
const SUGGESTIONS = ["Catch me up on the agent board", "What did my team push in the last day?", "Any open pull requests?", "File an issue for the login bug"];
const POLL_MS = 15_000;

const showArgs = (a: Record<string, unknown>) =>
  Object.entries(a).map(([k, v]) => `${k}: ${String(v)}`).join(", ").slice(0, 110);

export default function Coworker({ initialRepo }: { initialRepo: string }) {
  return (
    <ConversationProvider>
      <Panel initialRepo={initialRepo} />
    </ConversationProvider>
  );
}

function Panel({ initialRepo }: { initialRepo: string }) {
  const [repoInput, setRepoInput] = useState(initialRepo);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const seq = useRef(0);
  const repoRef = useRef("");
  const bottom = useRef<HTMLDivElement>(null);
  const cursor = useRef<BoardCursor | undefined>(undefined);
  const queue = useRef<BoardAlert[]>([]);
  const flushRef = useRef(() => {});

  const parsed = parseRepo(repoInput);
  useEffect(() => {
    repoRef.current = parsed.ok ? parsed.repo : "";
  }, [parsed]);

  // One generic client tool per spec. Reads the repo from a ref because the SDK
  // freezes these closures when the session starts.
  const clientTools = useMemo(
    () =>
      Object.fromEntries(
        TOOL_SPECS.map((s) => [
          s.name,
          async (args: Record<string, unknown>) => {
            const id = ++seq.current;
            const t0 = performance.now();
            setCalls((c) => [...c, { id, name: s.name, args, state: "running", text: "" }]);
            const finish = (state: Call["state"], text: string) =>
              setCalls((c) => c.map((x) => (x.id === id ? { ...x, state, text, ms: Math.round(performance.now() - t0) } : x)));
            try {
              const res = await fetch(`/api/tool/${s.name}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ repo: repoRef.current, args }),
              });
              const j = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
              if (!res.ok || typeof j.result !== "string") throw new Error(j.error ?? `Tool failed (HTTP ${res.status}).`);
              finish("ok", j.result);
              return j.result;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Tool failed.";
              finish("error", msg);
              throw new Error(msg);
            }
          },
        ]),
      ),
    [],
  );

  const convo = useConversation({
    clientTools,
    onMessage: ({ role, message }) => setMsgs((m) => [...m, { id: ++seq.current, role, text: message }]),
    onError: (message) => setError(message),
  });
  const live = convo.status === "connected";
  const busy = convo.status === "connecting";
  const working = calls.some((c) => c.state === "running");
  const repo = parsed.ok ? parsed.repo : "";
  const feed = [...calls.map((c) => ({ seq: c.id, c })), ...alerts.map((a) => ({ seq: a.seq, a }))].sort((x, y) => x.seq - y.seq);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, feed.length]);

  // Tell the agent about queued board alerts once it is idle, so we never talk over it.
  // sendUserMessage makes the agent speak; sendContextualUpdate does not.
  useEffect(() => {
    flushRef.current = () => {
      if (!live || convo.isSpeaking || working || !queue.current.length) return;
      convo.sendUserMessage(alertMessage(queue.current.splice(0)));
    };
    flushRef.current();
  });

  // While a session is live, check the agent board every 15 s for posts that need the user.
  useEffect(() => {
    if (!live || !repo) return;
    let stopped = false;
    let inFlight = false;
    cursor.current = undefined;
    queue.current = [];
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await pollBoard(repo, cursor.current);
        if (stopped) return;
        cursor.current = r.cursor;
        setBoardError(null);
        if (r.alerts.length) {
          setAlerts((a) => [...a, ...r.alerts.map((x) => ({ ...x, seq: ++seq.current }))]);
          queue.current.push(...r.alerts);
          flushRef.current();
        }
      } catch (e) {
        if (!stopped) setBoardError(e instanceof Error ? e.message : "Board check failed.");
      } finally {
        inFlight = false;
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, repo]);

  async function start(textOnly: boolean) {
    if (!parsed.ok) return;
    if (!agent.agent_id) return setError("The voice agent is not set up yet. Run scripts/sync-agent.ts.");
    setError(null);
    setMsgs([]);
    setCalls([]);
    setAlerts([]);
    setBoardError(null);
    if (!textOnly) {
      if (!navigator.mediaDevices?.getUserMedia) return setError("The microphone needs https or localhost. Use Type instead.");
      try {
        (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        return setError(
          denied
            ? "Microphone access is blocked. Allow it in your browser's address bar and press Talk again, or use Type instead."
            : "I could not open a microphone. Plug one in, or use Type instead.",
        );
      }
    }
    convo.startSession({
      agentId: agent.agent_id,
      dynamicVariables: { repo: parsed.repo, now: localNow() },
      ...(textOnly ? { textOnly: true, connectionType: "websocket" as const } : {}),
    });
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || !live) return;
    setMsgs((m) => [...m, { id: ++seq.current, role: "user", text: t }]);
    convo.sendUserMessage(t);
    setDraft("");
  }

  const state = busy ? "Connecting" : !live ? "Ready" : working ? "Checking GitHub" : convo.isSpeaking ? "Speaking" : "Listening";
  const tone = busy || working ? "text-warn" : live ? "text-signal" : "text-dim";
  const meterSource = !live ? null : convo.isSpeaking ? convo.getOutputByteFrequencyData : convo.getInputByteFrequencyData;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Repo Coworker</span>
        </div>
        <span className="hidden text-sm text-dim md:inline">A voice teammate that reads your repo and watches your agent board.</span>
        <a
          href={repo ? `https://github.com/${repo}` : undefined}
          target="_blank"
          rel="noreferrer"
          className="ml-auto font-mono text-sm text-dim underline-offset-4 hover:text-text hover:underline"
        >
          {repo || "no repo yet"}
        </a>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-px bg-line lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="flex min-w-0 flex-col bg-ink">
          <div className="flex flex-col items-center gap-6 px-5 pb-8 pt-12 sm:px-8">
            <VoiceMeter source={meterSource} live={live} speaking={convo.isSpeaking} />
            <p className={`text-sm font-medium tracking-wide ${tone}`} aria-live="polite">
              {state}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (live || busy) convo.endSession();
                else start(false);
              }}
              className="flex w-full max-w-xl flex-col gap-2"
            >
              <label htmlFor="repo" className="sr-only">
                GitHub repo
              </label>
              <div className="flex rounded-full border border-line bg-panel p-1.5 transition focus-within:border-signal/70">
                <input
                  id="repo"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  disabled={live || busy}
                  spellCheck={false}
                  placeholder="owner/name or a GitHub URL"
                  className="min-w-0 flex-1 bg-transparent px-4 font-mono text-base outline-none placeholder:text-dim/80 disabled:text-dim"
                />
                {live || busy ? (
                  <button type="submit" className="rounded-full bg-raise px-7 py-3 text-base font-semibold text-text transition hover:bg-bad hover:text-ink">
                    End call
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!parsed.ok}
                    className="flex items-center gap-2 rounded-full bg-signal px-7 py-3 text-base font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MicIcon />
                    Talk
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-sm text-dim">
                {repoInput.trim() && !parsed.ok ? (
                  <span className="text-warn">{parsed.error}</span>
                ) : !live && !busy ? (
                  <>
                    <span>Try</span>
                    {EXAMPLES.map((r) => (
                      <button key={r} type="button" onClick={() => setRepoInput(r)} className="font-mono text-text/80 underline decoration-line underline-offset-4 hover:text-signal">
                        {r}
                      </button>
                    ))}
                  </>
                ) : null}
                {!live && !busy && (
                  <button type="button" onClick={() => start(true)} disabled={!parsed.ok} className="ml-auto underline decoration-line underline-offset-4 hover:text-signal disabled:opacity-40">
                    No mic? Type instead
                  </button>
                )}
              </div>
            </form>
            {error && (
              <p role="alert" className="w-full max-w-xl rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-base text-[#ffc9c9]">
                {error}
              </p>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col border-t border-line px-5 py-6 sm:px-8">
            <div className="flex max-h-[26rem] min-h-40 flex-1 flex-col gap-4 overflow-y-auto pr-1">
              {msgs.length === 0 && (
                <p className="m-auto max-w-sm text-center text-base text-dim">
                  {live ? "Say something, or pick a question below." : "Press Talk and ask what your team shipped today."}
                </p>
              )}
              {msgs.map((m) =>
                m.role === "user" ? (
                  <p key={m.id} className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-raise px-4 py-2.5 text-base">
                    {m.text}
                  </p>
                ) : (
                  <p key={m.id} className="max-w-[65ch] text-xl leading-relaxed">
                    {m.text}
                  </p>
                ),
              )}
              <div ref={bottom} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={!live}
                  className="rounded-full border border-line px-3.5 py-1.5 text-sm text-text/85 transition enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
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
                disabled={!live}
                placeholder={live ? "Too loud? Type here" : "Start a call to type"}
                className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-base outline-none placeholder:text-dim/80 focus:border-signal/70 disabled:opacity-50"
              />
              <button type="submit" disabled={!live || !draft.trim()} className="rounded-xl bg-raise px-5 py-3 text-base font-medium transition enabled:hover:bg-line disabled:opacity-40">
                Send
              </button>
            </form>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-px bg-line">
          <div className="flex min-h-0 flex-1 flex-col bg-panel">
            <div className="flex items-center gap-3 px-5 pb-3 pt-5">
              <h2 className="text-base font-semibold">Live activity</h2>
              {live && (
                <span className={`ml-auto flex items-center gap-2 text-xs ${boardError ? "text-warn" : "text-dim"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${boardError ? "bg-warn" : "animate-pulse bg-signal"}`} />
                  {boardError ?? "Watching the board"}
                </span>
              )}
            </div>
            <ol className="flex max-h-[34rem] flex-1 flex-col overflow-y-auto">
              {feed.length === 0 && <li className="px-5 py-2 text-sm text-dim">Every GitHub call the agent makes, and every board post that needs you, lands here.</li>}
              {feed.map((f) =>
                "a" in f ? (
                  <li key={`a${f.seq}`} className="mx-3 my-2 rounded-xl border border-signal/50 bg-signal/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-signal">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
                      {f.a.why === "blocked" ? "Blocked, needs you" : "Mentions you"}
                    </div>
                    <p className="mt-1.5 text-base font-semibold">{f.a.from}</p>
                    <p className="mt-0.5 line-clamp-4 text-sm text-text/85">{f.a.text}</p>
                  </li>
                ) : (
                  <li key={`c${f.seq}`} className="border-t border-line/70 px-5 py-3 first:border-t-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${f.c.state === "running" ? "animate-pulse bg-warn" : f.c.state === "ok" ? "bg-ok" : "bg-bad"}`} />
                      <span className="truncate font-mono text-sm font-medium">{f.c.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-dim">{f.c.ms !== undefined ? `${f.c.ms} ms` : "running"}</span>
                    </div>
                    {Object.keys(f.c.args).length > 0 && <p className="mt-1 truncate pl-[18px] font-mono text-xs text-dim">{showArgs(f.c.args)}</p>}
                    {f.c.text && <p className={`mt-1 line-clamp-3 pl-[18px] text-sm ${f.c.state === "error" ? "text-bad" : "text-text/80"}`}>{f.c.text}</p>}
                  </li>
                ),
              )}
            </ol>
          </div>
          <div className="bg-panel p-5">
            <h2 className="mb-3 text-base font-semibold">Team standup</h2>
            <Standup repo={repo} />
          </div>
        </aside>
      </main>
    </div>
  );
}

// Signature move: 28 bars driven by the live ElevenLabs audio (agent voice while it speaks, your mic otherwise).
// Writes heights straight to the DOM each frame so React never re-renders at 60 fps.
function VoiceMeter({ source, live, speaking }: { source: (() => Uint8Array) | null; live: boolean; speaking: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!source) {
      bars.current.forEach((b) => b && (b.style.transform = "scaleY(0.08)"));
      return;
    }
    let raf = 0;
    const loop = () => {
      const data = source();
      const n = bars.current.length;
      bars.current.forEach((b, i) => {
        if (!b) return;
        const mid = Math.abs(i - (n - 1) / 2) / (n / 2); // 0 at centre, 1 at edges
        const v = data.length ? data[Math.floor((i / n) * data.length * 0.6)] / 255 : 0;
        b.style.transform = `scaleY(${Math.max(0.08, v * (1 - mid * 0.55))})`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [source]);

  return (
    <div className="flex h-28 items-center gap-1.5" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className={`h-full w-1.5 origin-center rounded-full transition-[background-color] duration-500 ${live ? (speaking ? "bg-signal" : "bg-text/70") : "bg-line"}`}
          style={{ transform: "scaleY(0.08)" }}
        />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="text-signal">
      {[4, 9, 14, 19].map((x, i) => (
        <rect key={x} x={x - 1.25} y={11 - [3, 7, 9, 5][i]} width="2.5" height={[3, 7, 9, 5][i] * 2} rx="1.25" fill="currentColor" />
      ))}
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
