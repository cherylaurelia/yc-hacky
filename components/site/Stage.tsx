"use client";
// The landing page's first viewport: your draft on the left, your agents on the right, the talk pill on the seam.
// One scripted exchange loops: an agent asks, you answer by holding fn, then you dictate into your draft.
import { useEffect, useRef, useState } from "react";

type AgentState = "working" | "standby" | "done" | "idle";
type Beat = {
  at: number; // ms into the loop
  codex: AgentState;
  codexLine: string;
  pill: "idle" | "speaking" | "listening" | "sent";
  pillText?: string;
  key: boolean; // fn held
  typing?: boolean;
};

const DRAFT_BASE = "The login fix is merged and deployed. ";
const DICTATED = "Codex is rerunning the auth tests; I'll ship the rest once they're green.";
const LOOP = 17_000;

const BEATS: Beat[] = [
  { at: 0, codex: "working", codexLine: "running tests", pill: "idle", key: false },
  { at: 2200, codex: "standby", codexLine: "3 tests failing in auth", pill: "idle", key: false },
  { at: 3200, codex: "standby", codexLine: "3 tests failing in auth", pill: "speaking", pillText: "Three auth tests fail. Retry or stop?", key: false },
  { at: 6600, codex: "standby", codexLine: "3 tests failing in auth", pill: "listening", pillText: "Retry with the new fixture.", key: true },
  { at: 8600, codex: "working", codexLine: "rerunning auth tests", pill: "sent", pillText: "Sent to Sam's Codex.", key: false },
  { at: 10000, codex: "working", codexLine: "rerunning auth tests", pill: "listening", key: true, typing: true },
  { at: 13800, codex: "done", codexLine: "tests pass · PR #77", pill: "idle", key: false },
];
const SETTLED = BEATS[BEATS.length - 1];

const beatAt = (t: number) => [...BEATS].reverse().find((b) => t >= b.at) ?? BEATS[0];

function Wave({ live, tone }: { live: boolean; tone: string }) {
  const [h, setH] = useState([4, 4, 4, 4, 4]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setH((p) => p.map(() => 4 + Math.round(Math.random() * 14))), 110);
    return () => clearInterval(id);
  }, [live]);
  return (
    <span className="wave flex h-[22px] items-center gap-[3px]" aria-hidden="true">
      {h.map((v, i) => (
        <i key={i} style={{ height: live ? v : 4, background: tone }} />
      ))}
    </span>
  );
}

function Row({ name, tape, state, line, wait }: { name: string; tape: string; state: AgentState; line: string; wait?: string }) {
  return (
    <div className={`grid grid-cols-[10px_1fr_auto] items-center gap-x-3 rounded-[10px] px-3 py-2.5 transition-colors duration-300 ${state === "standby" ? "bg-[var(--wings-hi)]" : ""}`}>
      <span className={`lamp ${state}`} />
      <span className="truncate text-[15px] font-semibold" style={{ color: tape }}>
        {name}
      </span>
      <span className={`text-[13px] ${state === "standby" ? "font-semibold text-[var(--standby)]" : "text-[var(--faint)]"}`}>{state === "standby" ? `waiting on you${wait ? ` · ${wait}` : ""}` : state}</span>
      <span />
      <span className="col-span-2 truncate text-[13.5px] text-[var(--dim)]">{line}</span>
    </div>
  );
}

export default function Stage() {
  const [t, setT] = useState(SETTLED.at + 1);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const frozenAt = useRef(0);

  useEffect(() => {
    // ?stage=<ms> freezes the demo at that moment, for screenshots and reviews.
    const frozen = Number(new URLSearchParams(window.location.search).get("stage"));
    if (Number.isFinite(frozen) && frozen > 0) {
      frozenAt.current = frozen;
      requestAnimationFrame(() => {
        setT(frozen % LOOP);
        setPaused(true);
      });
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.2 });
    if (ref.current) io.observe(ref.current);
    return () => {
      mq.removeEventListener("change", set);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reduced || paused || !onScreen || frozenAt.current) return;
    let start = performance.now() - (t % LOOP);
    if (t > SETTLED.at) start = performance.now(); // first run starts from the top
    let raf = 0;
    const tick = (now: number) => {
      if (document.visibilityState === "visible") setT((now - start) % LOOP);
      else start = now - (t % LOOP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the run conditions change
  }, [reduced, paused, onScreen]);

  const b = reduced ? SETTLED : beatAt(t);
  const typed = reduced ? DICTATED.length : b.typing ? Math.min(DICTATED.length, Math.floor(((t - b.at) / 3400) * DICTATED.length)) : t >= 13800 ? DICTATED.length : 0;
  const waited = b.codex === "standby" ? `0:${String(Math.floor((t - 2200) / 1000) + 38).padStart(2, "0")}` : undefined;
  const asking = b.pill === "speaking";
  const wide = b.pill !== "idle";

  return (
    <div ref={ref} id="stage" className="relative mx-auto w-full max-w-[1180px] px-5 sm:px-8">
      <p className="sr-only">
        Demonstration: while you write release notes, Sam&apos;s Codex reports three failing auth tests and asks whether to retry. You hold the fn key and say &quot;Retry with the new fixture&quot;. Codex reruns the tests; you then hold fn again and dictate a sentence into your notes, and Codex finishes with a pull request.
      </p>
      <div aria-hidden="true" className="relative grid grid-rows-[auto_auto] gap-4 sm:h-[min(52vh,440px)] sm:grid-cols-[55fr_45fr] sm:grid-rows-1 sm:gap-0">
        {/* Your side: the lit page */}
        <div className="lit relative flex min-h-[200px] flex-col rounded-[14px] px-6 pb-16 pt-5 sm:mr-5 sm:px-8 sm:pt-6">
          <div className="flex items-center justify-between border-b border-[var(--page-rule)] pb-3 text-[13px] text-[var(--page-dim)]">
            <span className="font-semibold">Release notes.md</span>
            <span>your draft</span>
          </div>
          <p className="mt-5 text-[19px] font-semibold sm:text-[clamp(20px,1.9vw,24px)]">Thursday</p>
          <ul className="mt-2 flex flex-col gap-1 text-[16px] text-[var(--page-dim)] sm:text-[17px]">
            <li>Invoice rounding is in review, PR 76.</li>
            <li>Staging is on the new fixtures.</li>
          </ul>
          <p className="mt-4 max-w-[34ch] text-[18px] leading-[1.5] sm:text-[clamp(19px,1.7vw,22px)]">
            {DRAFT_BASE}
            <span className="bg-[color-mix(in_oklab,var(--tape-alice)_22%,transparent)]">{DICTATED.slice(0, typed)}</span>
            <span className="caret" />
          </p>
        </div>

        {/* Their side: the board */}
        <div className="flex min-h-[240px] flex-col rounded-[14px] bg-[var(--wings-raise)] px-3 pb-20 pt-4 sm:ml-5">
          <div className="flex items-center justify-between px-3 pb-2 text-[13px] text-[var(--faint)]">
            <span className="font-semibold text-[var(--dim)]">Your agents</span>
            <span className={b.codex === "standby" ? "font-semibold text-[var(--standby)]" : ""}>{b.codex === "standby" ? "1 waiting" : "none waiting"}</span>
          </div>
          <Row name="Sam's Claude" tape="var(--tape-roger)" state="working" line="editing src/billing/invoice.ts" />
          <Row name="Sam's Codex" tape="var(--tape-sarah)" state={b.codex} line={b.codexLine} wait={waited} />
          {b.codex === "standby" && (
            <div className="mx-3 mb-1 mt-1 rounded-[9px] bg-[var(--page-ink)] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[var(--page)]">
              <span className="cmd">$ npm test -- auth</span>
              <br />
              <span className="cmd text-[var(--stuck-text)]">✕ 3 failed</span>
              <span className="cmd text-[var(--dim)]"> · fixtures/user.json out of date</span>
            </div>
          )}
          <Row name="Sam's Cursor" tape="var(--tape-jessica)" state="idle" line="last turn 12 min ago" />
        </div>

        {/* The seam: the pill */}
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center sm:left-[55%]">
          <div
            className="pill flex h-12 items-center gap-3 rounded-full pl-2.5 pr-5 text-[14px] transition-[width] duration-500"
            style={{ width: wide ? "min(86vw, 460px)" : 150, transitionTimingFunction: "var(--ease-out)" }}
          >
            <span className={`keycap flex-none px-2 py-0.5 text-[12px] font-semibold text-[var(--text)] transition-transform duration-150 ${b.key ? "down" : ""}`}>fn</span>
            <Wave live={b.pill === "speaking" || b.pill === "listening"} tone={asking ? "var(--tape-sarah)" : "var(--text)"} />
            <span className="min-w-0 flex-1 truncate">
              {b.pill === "idle" && <span className="text-[var(--faint)]">hold to talk</span>}
              {asking && (
                <>
                  <span className="font-semibold" style={{ color: "var(--tape-sarah)" }}>
                    Sam&apos;s Codex
                  </span>{" "}
                  <span className="text-[var(--dim)]">{b.pillText}</span>
                </>
              )}
              {b.pill === "listening" && <span>{b.pillText ?? "Listening…"}</span>}
              {b.pill === "sent" && <span className="text-[var(--dim)]">{b.pillText}</span>}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12.5px] text-[var(--faint)]">
        <span>Demo with sample agents, not a recording.</span>
        {!reduced && (
          <button type="button" onClick={() => setPaused((p) => !p)} className="rounded-md px-2 py-1 text-[var(--dim)] hover:bg-[var(--wings-raise)]" aria-pressed={paused}>
            {paused ? "Play demo" : "Pause demo"}
          </button>
        )}
      </div>
    </div>
  );
}
