"use client";

// All of Coworker's behaviour in one hook: the voice session, the board watcher, the one-at-a-time
// alert line, and the client tools. It returns plain data and actions, no markup, so any layout
// can render it. components/Coworker.tsx is the current view.
import { useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Alert, type AlertState, checkAnswer, current, findAlert, markAnswered, nextUp, normReq, waiting } from "@/lib/alerts";
import { type BoardAlert, type BoardCursor, NoBoardError, alertMessage, pollBoard } from "@/lib/board";
import { localNow } from "@/lib/now";
import { parseRepo, rememberRecent } from "@/lib/repo";
import { speakPost, unlockAudio } from "@/lib/speak-client";
import { aloud } from "@/lib/spoken";
import { TOOL_SPECS, type LocalToolName } from "@/lib/tool-specs";

export type Msg = { id: number; role: "user" | "agent"; text: string };
export type Call = { id: number; name: string; args: Record<string, unknown>; state: "running" | "ok" | "error"; text: string; ms?: number };
export type Phase = "idle" | "listening" | "thinking" | "speaking";
// Where the repo's board stands: not checked yet, found and polling, the repo has none, or the check failed.
export type BoardState = { kind: "checking" | "ok" | "none" } | { kind: "error"; message: string };
type NativeBridge = { webkit?: { messageHandlers?: { coworker?: { postMessage(m: unknown): void } } } };

const POLL_MS = 6_000;
const REPO_KEY = "coworker.repo";
const TAP_MS = 350; // a hold shorter than this is a tap: nothing to answer, so no "thinking"
const PLAY_GAP_MS = 4_000; // after an alert is injected, wait for the agent to start talking before the next one
const ANSWER_GAP_MS = 2_500; // after an answer is posted, let the agent say "Allowed." before the next alert
const ASK_TIMEOUT_MS = 90_000; // an unanswered question stops holding the line after this much silence

const soon = (ms: number) => Date.now() + ms;
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

// An alert still on the user's plate: unanswered blocked/stuck ones, and mentions not yet spoken or dismissed.
const isOpen = (a: Alert, hidden: ReadonlySet<number>) => a.state !== "answered" && !hidden.has(a.id) && !(a.why === "mention" && a.state === "told");

// What a desktop notification says under "<agent> needs you".
function noticeBody(a: Alert): string {
  const c = a.ctx;
  if (a.kind === "approval") return c?.command ? `Wants to run ${c.command}` : c?.file ? `Wants to edit ${c.file.split("/").pop()}` : "Needs your OK";
  if (a.kind === "stuck") return "Keeps failing at the same step";
  return a.text;
}

export function useCoworker({ initialRepo, board, embed }: { initialRepo: string; board?: number; embed: boolean }) {
  const first = parseRepo(initialRepo);
  const [repo, setRepoState] = useState(first.ok ? first.repo : "");
  const [ready, setReady] = useState(first.ok);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [boardState, setBoardState] = useState<BoardState>({ kind: "checking" });
  const [madeBoard, setMadeBoard] = useState<number | null>(null); // the board this page just created: GitHub's label list lags a few seconds behind
  const [error, setError] = useState<string | null>(null);
  const [canType, setCanType] = useState(false);
  const [textOnly, setTextOnly] = useState(false);
  const [held, setHeld] = useState(false);
  const [starting, setStarting] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [pttKey, setPttKey] = useState("fn");
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [gesture, setGesture] = useState(false);

  const seq = useRef(0);
  const noticed = useRef(new Set<number>());
  const notices = useRef(new Map<number, Notification>());
  const alertsRef = useRef<Alert[]>([]);
  const answeredReqs = useRef(new Set<string>());
  const lastActive = useRef(0);
  const repoRef = useRef("");
  const sources = useRef(new Set<string>());
  const pressedAt = useRef(0);
  const awaitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
      if (saved.ok) setRepoState(saved.repo);
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
    rememberRecent(repo);
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
            const sent = board && (s.name.startsWith("board_") || s.name === "answer_request") ? { ...args, board } : args;
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
            await speakPost(a.from, aloud(a.text));
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

  // While a repo is open, check the agent board every 15 s for posts that need the user. Alerts that
  // arrive before a voice session starts wait on screen and are spoken once the session is live.
  useEffect(() => {
    if (!repo) return;
    let stopped = false;
    let inFlight = false;
    cursor.current = undefined;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await pollBoard(repo, cursor.current, "", board ?? madeBoard ?? undefined);
        if (stopped) return;
        cursor.current = r.cursor;
        setBoardState((s) => (s.kind === "ok" ? s : { kind: "ok" }));
        for (const q of r.answered) answeredReqs.current.add(q);
        const fresh: Alert[] = r.alerts.map((x) => ({ ...x, seq: ++seq.current, state: "waiting" }));
        if (fresh.length || r.answered.length) setAlerts((a) => markAnswered([...a, ...fresh], answeredReqs.current));
      } catch (e) {
        if (stopped) return;
        // A dropped connection reads "Failed to fetch" in the browser, which says nothing to the user.
        const offline = e instanceof TypeError || (e instanceof DOMException && e.name === "TimeoutError");
        setBoardState(e instanceof NoBoardError ? { kind: "none" } : { kind: "error", message: offline ? "I can't reach the server. Trying again." : e instanceof Error ? e.message : "Board check failed." });
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
  }, [repo, board, madeBoard]);

  // Open this repo's board as the signed-in user, then look at it again. Throws a sentence for the page to show.
  async function createBoard() {
    const res = await fetch("/api/board", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
    const j = (await res.json().catch(() => ({}))) as { number?: number; error?: string };
    if (!res.ok || !j.number) throw new Error(j.error ?? `Could not create the board (HTTP ${res.status}).`);
    setBoardState({ kind: "checking" });
    setMadeBoard(j.number); // restarts the board check, now pointed at this issue
  }

  async function start(asText: boolean) {
    if (!repo || starting || convo.status === "connecting" || convo.status === "connected") return;
    setError(null);
    setCanType(false);
    setStarting(true);
    setTextOnly(asText);
    setMsgs([]);
    setCalls([]);
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
    let session: { conversationToken: string } | { signedUrl: string; textOnly: true; connectionType: "websocket" };
    try {
      const res = await fetch(`/api/convai-token${asText ? "?text=1" : ""}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { conversationToken?: string; signedUrl?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `Could not start a session (HTTP ${res.status}).`);
      if (j.signedUrl) session = { signedUrl: j.signedUrl, textOnly: true, connectionType: "websocket" };
      else if (j.conversationToken) session = { conversationToken: j.conversationToken };
      else throw new Error("The server sent back no session.");
    } catch (e) {
      setStarting(false);
      return setError(e instanceof Error ? e.message : "Could not start a session.");
    }
    convo.startSession({ ...session, dynamicVariables: { repo, now: localNow() } });
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
  const source = !live ? null : phase === "speaking" ? convo.getOutputByteFrequencyData : convo.getInputByteFrequencyData;

  const skip = (id: number) => setAlerts((all) => all.map((x) => (x.id === id && x.state === "asking" ? { ...x, state: "told" } : x)));

  const open = alerts.filter((a) => isOpen(a, hidden));
  // The one card on screen: what "show me" asked for, else the one being spoken about, else the oldest open.
  const card = (focused && open.includes(focused) ? focused : undefined) ?? (current(alerts) && open.includes(current(alerts)!) ? current(alerts) : undefined) ?? open[0] ?? null;
  // The first click or key press is the browser's licence to play audio, and the moment to ask once for notification permission.
  useEffect(() => {
    const first = () => {
      window.removeEventListener("pointerdown", first, true);
      window.removeEventListener("keydown", first, true);
      setGesture(true);
      try {
        if ("Notification" in window && Notification.permission === "default") Promise.resolve(Notification.requestPermission()).catch((e) => console.warn("Notification permission failed:", e));
      } catch (e) {
        console.warn("Could not ask for notification permission:", e);
      }
    };
    window.addEventListener("pointerdown", first, true);
    window.addEventListener("keydown", first, true);
    return () => {
      window.removeEventListener("pointerdown", first, true);
      window.removeEventListener("keydown", first, true);
    };
  }, []);

  // Safari only counts a click or key press as licence to play, so unlock the shared audio element on those too.
  useEffect(() => {
    window.addEventListener("click", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return () => {
      window.removeEventListener("click", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, []);

  // An alert that arrives while the tab is hidden or unfocused gets one desktop notification, closed once it is answered
  // or dismissed. Clicking it brings the window forward and opens that alert's card.
  useEffect(() => {
    for (const a of alerts) {
      if (noticed.current.has(a.id)) continue;
      noticed.current.add(a.id);
      if (!(document.hidden || !document.hasFocus()) || !("Notification" in window) || Notification.permission !== "granted") continue;
      try {
        const n = new Notification(`${a.from} ${a.why === "blocked" ? "needs you" : "has news for you"}`, { body: noticeBody(a), tag: a.req ?? String(a.id), requireInteraction: true });
        n.onclick = () => {
          window.focus();
          setFocus(a.seq);
        };
        notices.current.set(a.id, n);
      } catch (e) {
        console.warn("Could not show a notification:", e);
      }
    }
    for (const [id, n] of notices.current) {
      const a = alerts.find((x) => x.id === id);
      if (!a || !isOpen(a, hidden)) {
        n.close();
        notices.current.delete(id);
      }
    }
  }, [alerts, hidden]);

  const speaker = phase === "speaking" ? (playing?.from ?? "coworker") : phase === "listening" ? "you" : null;

  // A click on Allow, Deny or Stop: the user named the alert by looking at it, so it is posted for
  // that card's request directly, without the spoken-turn check the voice tool makes.
  async function answer(a: Alert, decision: "allow" | "deny" | "stop") {
    if (!a.req) return;
    setError(null);
    try {
      const res = await fetch("/api/tool/answer_request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: repoRef.current, args: { request_id: a.req, decision, ...(board ? { board } : {}) } }),
      });
      const j = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
      if (!res.ok || typeof j.result !== "string") throw new Error(j.error ?? `Could not post the answer (HTTP ${res.status}).`);
      answeredReqs.current.add(a.req);
      setAlerts((all) => markAnswered(all, answeredReqs.current));
      if (focus === a.seq) setFocus(null);
      quietUntil.current = soon(ANSWER_GAP_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the answer.");
    }
  }
  const dismiss = (id: number) => setHidden((h) => new Set(h).add(id));

  // Pick another repo: drop the old repo's alerts and chat, end a live session, and put the repo in the address bar.
  function switchRepo(next: string) {
    if (next === repo) return;
    if (live || connecting) void convo.endSession();
    setRepoState(next);
    setAlerts([]);
    setHidden(new Set());
    setFocus(null);
    setMsgs([]);
    setCalls([]);
    setBoardState({ kind: "checking" });
    setMadeBoard(null);
    setError(null);
    answeredReqs.current.clear();
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("repo", next);
      else url.searchParams.delete("repo");
      window.history.replaceState(null, "", url);
    } catch (e) {
      console.warn("Could not update the address bar:", e);
    }
  }

  return {
    status: { phase, sub, hint, mic, live, connecting, textOnly, canType, error, board: boardState, madeBoard, gesture },
    transcript: msgs,
    feed,
    alerts,
    // Alerts behind the one being handled, in the order they will speak.
    queue: alerts.filter((a) => a.state === "waiting"),
    // Agents that have posted alerts, with how many are still open and the kind of their latest one.
    agents: [...new Set(alerts.map((a) => a.from))].map((name) => ({
      name,
      open: open.filter((a) => a.from === name).length,
      latest: alerts.findLast((a) => a.from === name)?.kind ?? null,
    })),
    open,
    card,
    speaker,
    waiting: { count: waitingNow.length, stuck: waitingNow.some((a) => a.kind === "stuck") },
    focus: focused ?? null,
    repo: { current: repo, ready },
    meterSource: source,
    actions: { start, press, send, setRepo: switchRepo, setFocus, skip, answer, dismiss, createBoard, endSession: () => convo.endSession() },
  };
}
