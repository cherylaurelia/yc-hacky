"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import agent from "@/agent.json";
import { localNow } from "@/lib/now";
import { parseRepo } from "@/lib/repo";
import { TOOL_SPECS } from "@/lib/tool-specs";

type Msg = { id: number; role: "user" | "agent"; text: string };
type Call = { id: number; name: string; args: Record<string, unknown>; state: "running" | "ok" | "error"; text: string; ms?: number };

const EXAMPLES = ["azizu06/hackathon-agent-board", "vercel/next.js"];
const SUGGESTIONS = ["What did my team push in the last day?", "Any open pull requests?", "File an issue for the login bug"];

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
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const seq = useRef(0);
  const repoRef = useRef("");
  const bottom = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, calls]);

  async function start(textOnly: boolean) {
    if (!parsed.ok) return;
    if (!agent.agent_id) return setError("The voice agent is not set up yet. Run scripts/sync-agent.ts.");
    setError(null);
    setMsgs([]);
    setCalls([]);
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

  const state = busy ? "Connecting..." : !live ? "Idle" : working ? "Checking GitHub..." : convo.isSpeaking ? "Speaking" : "Listening";
  const dot = busy || working ? "bg-amber-400 animate-pulse" : live ? (convo.isSpeaking ? "bg-sky-400 animate-pulse" : "bg-emerald-400 animate-pulse") : "bg-zinc-600";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Repo Coworker</h1>
        <p className="mt-3 max-w-2xl text-lg text-zinc-400 sm:text-xl">
          Paste a GitHub repo, press Talk, and ask what your team shipped. It reads the repo live and can file the issue for you.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <label htmlFor="repo" className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          GitHub repo
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            disabled={live || busy}
            spellCheck={false}
            placeholder="owner/name or https://github.com/owner/name"
            className="min-w-0 flex-1 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 font-mono text-lg outline-none transition focus:border-emerald-500 disabled:opacity-60"
          />
          {live || busy ? (
            <button onClick={() => convo.endSession()} className="rounded-2xl bg-red-500 px-10 py-4 text-xl font-semibold text-white transition hover:bg-red-400">
              Stop
            </button>
          ) : (
            <button
              onClick={() => start(false)}
              disabled={!parsed.ok}
              className="rounded-2xl bg-emerald-500 px-10 py-4 text-xl font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Talk
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500">
          {repoInput.trim() && !parsed.ok ? (
            <span className="text-amber-400">{parsed.error}</span>
          ) : parsed.ok ? (
            <span>
              {live ? "Plugged into" : "Repo:"} <span className="font-mono text-zinc-300">{parsed.repo}</span>
            </span>
          ) : null}
          {!live && !busy && (
            <>
              <span>Try:</span>
              {EXAMPLES.map((r) => (
                <button key={r} onClick={() => setRepoInput(r)} className="font-mono text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-emerald-400">
                  {r}
                </button>
              ))}
              <button onClick={() => start(true)} disabled={!parsed.ok} className="ml-auto text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-emerald-400 disabled:opacity-40">
                Type instead
              </button>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-base text-red-300">
            {error}
          </p>
        )}
      </section>

      <section className="flex items-center gap-3 text-lg" aria-live="polite">
        <span className={`h-3.5 w-3.5 rounded-full ${dot}`} />
        <span className="font-medium">{state}</span>
      </section>

      <div className="grid flex-1 gap-6 md:grid-cols-2">
        <section className="flex min-h-80 flex-col rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">Conversation</h2>
          <div className="flex max-h-[28rem] flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {msgs.length === 0 && (
              <p className="text-lg text-zinc-500">
                {live ? "Say something, or tap a suggestion." : "Press Talk and ask about your repo."}
              </p>
            )}
            {msgs.map((m) => (
              <p key={m.id} className={m.role === "user" ? "self-end rounded-2xl bg-zinc-800 px-4 py-3 text-lg" : "text-xl leading-snug text-emerald-100"}>
                {m.text}
              </p>
            ))}
            <div ref={bottom} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={!live} className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition enabled:hover:border-emerald-500 enabled:hover:text-emerald-300 disabled:opacity-40">
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
              placeholder={live ? "Too loud? Type here" : "Connect to type a message"}
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-emerald-500 disabled:opacity-40"
            />
            <button type="submit" disabled={!live || !draft.trim()} className="rounded-xl bg-zinc-800 px-5 py-3 text-base font-medium transition enabled:hover:bg-zinc-700 disabled:opacity-40">
              Send
            </button>
          </form>
        </section>

        <section className="flex min-h-80 flex-col rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">What it is doing</h2>
          <div className="flex max-h-[34rem] flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {calls.length === 0 && <p className="text-lg text-zinc-500">Every GitHub call the agent makes shows up here.</p>}
            {calls.map((c) => (
              <div key={c.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${c.state === "running" ? "animate-pulse bg-amber-400" : c.state === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="font-mono text-lg font-medium">{c.name}</span>
                  <span className="ml-auto font-mono text-sm text-zinc-500">{c.ms !== undefined ? `${c.ms} ms` : "running"}</span>
                </div>
                {Object.keys(c.args).length > 0 && <p className="mt-1 font-mono text-sm text-zinc-500">{showArgs(c.args)}</p>}
                {c.text && <p className={`mt-2 line-clamp-4 text-base ${c.state === "error" ? "text-red-300" : "text-zinc-300"}`}>{c.text}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
