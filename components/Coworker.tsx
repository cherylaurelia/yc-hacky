"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import agent from "@/agent.json";
import FocusCard from "@/components/FocusCard";
import Standup from "@/components/Standup";
import { type Alert, type AlertState, checkAnswer, findAlert, markAnswered, nextUp, normReq, waiting } from "@/lib/alerts";
import { type BoardAlert, type BoardCursor, alertMessage, pollBoard } from "@/lib/board";
import { localNow } from "@/lib/now";
import { parseRepo } from "@/lib/repo";
import { speakPost } from "@/lib/speak-client";
import { TOOL_SPECS, type LocalToolName } from "@/lib/tool-specs";

type Msg = { id: number; role: "user" | "agent"; text: string };
type Call = { id: number; name: string; args: Record<string, unknown>; state: "running" | "ok" | "error"; text: string; ms?: number };
type Phase = "idle" | "listening" | "thinking" | "speaking";
type NativeBridge = { webkit?: { messageHandlers?: { coworker?: { postMessage(m: unknown): void } } } };

const POLL_MS = 15_000;
const REPO_KEY = "coworker.repo";
const TAP_MS = 350; // a hold shorter than this is a tap: nothing to answer, so no "thinking"
const PLAY_GAP_MS = 4_000; // after an alert is injected, wait for the agent to start talking before the next one
const ANSWER_GAP_MS = 2_500; // after an answer is posted, let the agent say "Allowed." before the next alert
const ASK_TIMEOUT_MS = 90_000; // an unanswered question stops holding the line after this much silence

// The chip on each alert card: where it is in the line.
const STATE_LABEL: Record<AlertState, string> = { waiting: "waiting", playing: "speaking", asking: "asking", told: "told", answered: "answered" };
const soon = (ms: number) => Date.now() + ms;
const isLocalhost = () => typeof window !== "undefined" && /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

const LOOK: Record<Phase, { box: string; bar: string; word: string }> = {
  idle: { box: "border-line bg-panel", bar: "bg-line", word: "text-text" },
  listening: { box: "border-signal bg-signal/10 shadow-[0_0_56px_-14px] shadow-signal", bar: "bg-signal", word: "text-signal" },
  thinking: { box: "animate-pulse border-warn/70 bg-warn/10", bar: "bg-warn", word: "text-warn" },
  speaking: { box: "border-ok/70 bg-ok/10", bar: "bg-ok", word: "text-ok" },
};

const showArgs = (a: Record<string, unknown>) =>
  Object.entries(a).map(([k, v]) => `${k}: ${String(v)}`).join(", ").slice(0, 110);

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

// The text injected into the live conversation. Posts we already played aloud in the poster's
// own voice are marked so the agent asks what to do instead of reading them out a second time.
function spokenAlerts(played: BoardAlert[], missed: BoardAlert[]): string {
  const parts: string[] = [];
  if (played.length) {
    const who = played.map((a) => a.from).join(" and ");
    parts.push(
      `${alertMessage(played)}\nThe user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell ${who}?" If it says "needs approval (req X)", reply only: "Allow?"`,
    );
  }
  if (missed.length) parts.push(alertMessage(missed));
  return parts.join("\n");
}

export default function Coworker({ initialRepo, board, embed }: { initialRepo: string; board?: number; embed: boolean }) {
  return (
    <ConversationProvider>
      <Panel initialRepo={initialRepo} board={board} embed={embed} />
    </ConversationProvider>
  );
}

function Panel({ initialRepo, board, embed }: { initialRepo: string; board?: number; embed: boolean }) {
  const first = parseRepo(initialRepo);
  const [repo, setRepo] = useState(first.ok ? first.repo : "");
  const [ready, setReady] = useState(first.ok);
  const [repoInput, setRepoInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canType, setCanType] = useState(false);
  const [textOnly, setTextOnly] = useState(false);
  const [draft, setDraft] = useState("");
  const [held, setHeld] = useState(false);
  const [starting, setStarting] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [standup, setStandup] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [pttKey, setPttKey] = useState("fn");

  const seq = useRef(0);
  const alertsRef = useRef<Alert[]>([]);
  const answeredReqs = useRef(new Set<string>());
  const lastActive = useRef(0);
  const repoRef = useRef("");
  const sources = useRef(new Set<string>());
  const pressedAt = useRef(0);
  const awaitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const msgEnd = useRef<HTMLDivElement>(null);
  const feedEnd = useRef<HTMLDivElement>(null);
  const cursor = useRef<BoardCursor | undefined>(undefined);
  const draining = useRef(false);
  const quietUntil = useRef(0);
  const pressRef = useRef<(src: string, on: boolean, cancelled?: boolean) => void>(() => {});
  const drainRef = useRef(() => {});

  // First run with no ?repo=: fall back to the last repo this browser used. localStorage only
  // exists in the browser, so it can be read only after hydration.
  useEffect(() => {
    if (ready) return;
    try {
      const saved = parseRepo(localStorage.getItem(REPO_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved.ok) setRepo(saved.repo);
    } catch (e) {
      console.warn("Could not read the saved repo:", e);
    }
    setReady(true);
  }, [ready]);

  useEffect(() => {
    repoRef.current = repo;
    if (!repo) return;
    try {
      localStorage.setItem(REPO_KEY, repo);
    } catch (e) {
      console.warn("Could not save the repo:", e);
    }
  }, [repo]);

  // One generic client tool per spec. Reads the repo from a ref because the SDK
  // freezes these closures when the session starts. The URL's board wins for board tools.
  // Local tools (no /api/tool route) run in the browser; the rest go to the server.
  const clientTools = useMemo(() => {
    const strArg = (v: unknown) => (typeof v === "string" ? v : undefined);
    const local: Record<LocalToolName, (a: Record<string, unknown>) => string> = {
      show_me(a) {
        const r = findAlert(alertsRef.current, strArg(a.agent), strArg(a.req));
        if ("error" in r) throw new Error(r.error);
        setFocus(r.alert.seq);
        return `Showing the ${r.alert.kind ?? "alert"} from ${r.alert.from} on screen${r.alert.ctx?.diff ? ", with its diff" : ""}.`;
      },
    };
    // An answer posted on the board frees the line: close the alert it belongs to, give the agent
    // a moment to say "Allowed.", then the next one may speak.
    const settle = (name: string, a: Record<string, unknown>) => {
      if (name === "answer_request") {
        answeredReqs.current.add(normReq(a.request_id));
        setAlerts((all) => markAnswered(all, answeredReqs.current));
      } else if (name === "board_post") {
        const to = (strArg(a.to) ?? "").replace(/^@/, "").toLowerCase();
        setAlerts((all) => all.map((x) => (!x.req && x.state !== "answered" && (to ? x.login.toLowerCase() === to : x.state === "asking") ? { ...x, state: "answered" } : x)));
      } else return;
      quietUntil.current = soon(ANSWER_GAP_MS);
      setAwaiting(true);
      clearTimeout(awaitTimer.current);
      awaitTimer.current = setTimeout(() => setAwaiting(false), 12_000);
      setTimeout(() => drainRef.current(), ANSWER_GAP_MS + 100);
    };
    return Object.fromEntries(
        TOOL_SPECS.map((s) => [
          s.name,
          async (args: Record<string, unknown>) => {
            const id = ++seq.current;
            const t0 = performance.now();
            const sent = board && s.name.startsWith("board_") ? { ...args, board } : args;
            lastActive.current = Date.now();
            setCalls((c) => [...c, { id, name: s.name, args: sent, state: "running", text: "" }]);
            const finish = (state: Call["state"], text: string) =>
              setCalls((c) => c.map((x) => (x.id === id ? { ...x, state, text, ms: Math.round(performance.now() - t0) } : x)));
            try {
              if ("local" in s) {
                const text = local[s.name](sent);
                finish("ok", text);
                return text;
              }
              if (s.name === "answer_request") {
                const wrong = checkAnswer(alertsRef.current, normReq(sent.request_id));
                if (wrong) throw new Error(wrong);
              }
              const res = await fetch(`/api/tool/${s.name}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ repo: repoRef.current, args: sent }),
              });
              const j = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
              if (!res.ok || typeof j.result !== "string") throw new Error(j.error ?? `Tool failed (HTTP ${res.status}).`);
              settle(s.name, sent);
              finish("ok", j.result);
              return j.result;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Tool failed.";
              finish("error", msg);
              throw new Error(msg);
            }
          },
        ]),
      );
  }, [board]);

  const convo = useConversation({
    clientTools,
    onMessage: ({ role, message }) => {
      setMsgs((m) => [...m, { id: ++seq.current, role, text: message }]);
      lastActive.current = Date.now();
      if (role === "agent") setAwaiting(false);
    },
    onError: (message) => {
      setError(message);
      setStarting(false);
    },
    onConnect: () => setStarting(false),
    onDisconnect: () => {
      setAwaiting(false);
      setStarting(false);
    },
  });
  const { setMuted } = convo;
  const live = convo.status === "connected";
  const connecting = starting || convo.status === "connecting";
  const working = calls.some((c) => c.state === "running");
  const playing = alerts.find((a) => a.state === "playing");
  const feed = [...calls.map((c) => ({ seq: c.id, c })), ...alerts.map((a) => ({ seq: a.seq, a }))].sort((x, y) => x.seq - y.seq);
  const waitingNow = waiting(alerts);
  const focused = alerts.find((a) => a.seq === focus);

  // The one state the whole UI (and the Mac menu-bar icon) follows.
  const phase: Phase = held && live ? "listening" : playing || convo.isSpeaking ? "speaking" : connecting || working || awaiting ? "thinking" : "idle";
  const mic = !live || textOnly ? "off" : convo.isMuted ? "muted" : "live";

  useEffect(() => {
    try {
      (window as unknown as NativeBridge).webkit?.messageHandlers?.coworker?.postMessage({ state: phase });
    } catch (e) {
      console.warn("Could not tell the Mac app the state:", e);
    }
  }, [phase]);

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs]);
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feed.length]);

  // Push to talk: the mic is live only while a key, the button or the Mac app holds it.
  useEffect(() => {
    if (!live || textOnly) return;
    try {
      setMuted(!held);
    } catch (e) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- failure path only: the mic could not be switched
      setError(e instanceof Error ? e.message : "Could not switch the microphone.");
    }
  }, [live, textOnly, held, setMuted]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // The waiting line: one alert at a time. Its poster speaks in their own voice, the agent asks the
  // user, and only after the answer is posted (or skipped, or 90 s of silence) does the next alert
  // speak. Runs when the agent is idle and the user is not talking, so audio never overlaps.
  useEffect(() => {
    drainRef.current = async () => {
      const mark = (id: number, state: AlertState) => setAlerts((all) => all.map((a) => (a.id === id && a.state !== "answered" ? { ...a, state } : a)));
      const stale = alerts.find((a) => a.state === "asking");
      if (stale && Date.now() - lastActive.current > ASK_TIMEOUT_MS && !held && !working) return mark(stale.id, "told");
      const a = nextUp(alerts);
      if (!a || draining.current || !live || held || convo.isSpeaking || working || awaiting || Date.now() < quietUntil.current) return;
      draining.current = true;
      try {
        mark(a.id, "playing");
        let played = false;
        // A stuck loop is the coworker's own sentence ("has retried ... Want me to stop it?"), not a post to replay.
        if (a.kind !== "stuck") {
          try {
            console.info(`[coworker] voice start ${a.from} ${new Date().toISOString()}`);
            await speakPost(a.from, a.text);
            played = true;
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not play that board post.");
          } finally {
            console.info(`[coworker] voice end ${a.from} ${new Date().toISOString()}`);
          }
        }
        quietUntil.current = Date.now() + PLAY_GAP_MS;
        lastActive.current = Date.now();
        convo.sendUserMessage(spokenAlerts(played ? [a] : [], played ? [] : [a]));
        setAwaiting(true); // shows "thinking" until the agent starts its question
        clearTimeout(awaitTimer.current);
        awaitTimer.current = setTimeout(() => setAwaiting(false), 12_000);
        mark(a.id, a.why === "blocked" ? "asking" : "told");
      } catch (e) {
        mark(a.id, "told");
        setError(e instanceof Error ? e.message : "Could not tell the agent about the board post.");
      } finally {
        draining.current = false;
      }
    };
    drainRef.current();
  });

  // While a session is live, check the agent board every 15 s for posts that need the user.
  useEffect(() => {
    if (!live || !repo) return;
    let stopped = false;
    let inFlight = false;
    cursor.current = undefined;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await pollBoard(repo, cursor.current, "", board);
        if (stopped) return;
        cursor.current = r.cursor;
        setBoardError(null);
        for (const q of r.answered) answeredReqs.current.add(q);
        const fresh: Alert[] = r.alerts.map((x) => ({ ...x, seq: ++seq.current, state: "waiting" }));
        if (fresh.length || r.answered.length) setAlerts((a) => markAnswered([...a, ...fresh], answeredReqs.current));
      } catch (e) {
        if (!stopped) setBoardError(e instanceof Error ? e.message : "Board check failed.");
      } finally {
        inFlight = false;
      }
      if (!stopped) drainRef.current();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, repo, board]);

  async function start(asText: boolean) {
    if (!repo || starting || convo.status === "connecting" || convo.status === "connected") return;
    if (!agent.agent_id) return setError("The voice agent is not set up yet. Run scripts/sync-agent.ts.");
    setError(null);
    setCanType(false);
    setStarting(true);
    setTextOnly(asText);
    setMsgs([]);
    setCalls([]);
    setAlerts([]);
    setFocus(null);
    answeredReqs.current.clear();
    setBoardError(null);
    if (!asText) {
      const fail = (msg: string) => {
        setStarting(false);
        setCanType(true);
        setError(msg);
      };
      if (!navigator.mediaDevices?.getUserMedia) return fail("The microphone needs https or localhost.");
      try {
        (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        return fail(denied ? "Microphone access is blocked. Allow it in your browser's address bar, then hold again." : "I could not open a microphone. Plug one in, then hold again.");
      }
    }
    convo.startSession({
      agentId: agent.agent_id,
      dynamicVariables: { repo, now: localNow() },
      ...(asText ? { textOnly: true, connectionType: "websocket" as const } : {}),
    });
  }

  // `src` is "key", "pointer" or "event"; the mic is held while any source is down.
  // A cancelled release (the Mac app's fn tap) drops the turn: mute, and do not wait for an answer.
  function press(src: string, on: boolean, cancelled = false) {
    const was = sources.current.size > 0;
    if (on) sources.current.add(src);
    else sources.current.delete(src);
    const now = sources.current.size > 0;
    if (now === was) return;
    setHeld(now);
    clearTimeout(awaitTimer.current);
    if (now) {
      pressedAt.current = Date.now();
      setAwaiting(false);
      if (!live && !textOnly) void start(false);
    } else if (live && !textOnly && !cancelled && Date.now() - pressedAt.current > TAP_MS) {
      setAwaiting(true);
      awaitTimer.current = setTimeout(() => setAwaiting(false), 12_000);
    }
  }
  useEffect(() => {
    pressRef.current = press;
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) pressRef.current("key", true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") pressRef.current("key", false);
    };
    const lost = () => {
      pressRef.current("key", false);
      pressRef.current("pointer", false);
    };
    const pointerUp = () => pressRef.current("pointer", false);
    const ptt = (e: Event) => {
      const d = (e as CustomEvent<{ down?: boolean; cancelled?: boolean }>).detail;
      pressRef.current("event", d?.down === true, d?.cancelled === true);
    };
    // The Mac app says which key it listens to: "fn", "Right Option", ...
    const pttKeyName = (e: Event) => {
      const k = (e as CustomEvent<{ key?: unknown }>).detail?.key;
      if (typeof k === "string" && k.trim()) setPttKey(k.trim().slice(0, 24));
    };
    window.addEventListener("coworker-ptt-key", pttKeyName);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", lost);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    window.addEventListener("coworker-ptt", ptt);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", lost);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("coworker-ptt", ptt);
      window.removeEventListener("coworker-ptt-key", pttKeyName);
    };
  }, []);

  function send(text: string) {
    const t = text.trim();
    if (!t || !live) return;
    setMsgs((m) => [...m, { id: ++seq.current, role: "user", text: t }]);
    convo.sendUserMessage(t);
    setDraft("");
  }

  const hint = embed ? `Hold ${pttKey} to talk` : "Hold Space to talk";
  const sub =
    phase === "listening"
      ? "Mic live. Let go to send."
      : phase === "speaking"
        ? playing
          ? `${playing.from} says`
          : "Talking"
        : phase === "thinking"
          ? connecting
            ? "Connecting"
            : working
              ? "Checking GitHub"
              : "Working on it"
          : mic === "muted"
            ? "Mic muted"
            : hint;
  const look = LOOK[phase];
  const source = !live ? null : phase === "speaking" ? convo.getOutputByteFrequencyData : convo.getInputByteFrequencyData;
  const repoError = repoInput.trim() ? parseRepo(repoInput) : null;

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
        <p data-waiting={waitingNow.length} className={`self-center rounded-full border px-3.5 py-1.5 text-sm ${waitingNow.length ? (waitingNow.some((a) => a.kind === "stuck") ? "border-bad/60 bg-bad/10 text-bad" : "border-signal/50 bg-signal/10 text-signal") : "border-line text-dim"}`}>
          Agents waiting on you: <span className="font-semibold tabular-nums">{waitingNow.length}</span>
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
                        <button type="button" onClick={() => setAlerts((all) => all.map((x) => (x.id === f.a.id && x.state === "asking" ? { ...x, state: "told" } : x)))} className="text-xs text-dim underline underline-offset-4 hover:text-text">
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
              <button type="button" onClick={() => convo.endSession()} className="underline underline-offset-4 hover:text-bad">
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
