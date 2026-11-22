// How often Coworker may speak up on its own. Pure, so the hook only owns the clock, the saved
// setting and the queue (lib/alerts.ts). Anything the user starts, like push to talk, is never filtered here.
import { type Alert, nextUp } from "./alerts.ts";

// all: blockers and updates (a PR ready) are read aloud. blockers: only what holds an agent up;
// updates wait for the standup. dnd: nothing speaks on its own and blockers stay queued, until
// quietUntil (a clock time) or, when null, until the user turns it off. previousMode comes back after.
export type Loud = "all" | "blockers";
export type Interruptions = { mode: Loud } | { mode: "dnd"; quietUntil: number | null; previousMode: Loud };

export const DEFAULT_INTERRUPTIONS: Interruptions = { mode: "all" };
export const QUIET_MS = 30 * 60_000;

export const goQuiet = (s: Interruptions, now: number, forMs: number | null): Interruptions => ({
  mode: "dnd",
  quietUntil: forMs === null ? null : now + forMs,
  previousMode: s.mode === "dnd" ? s.previousMode : s.mode,
});
export const endQuiet = (s: Interruptions): Interruptions => (s.mode === "dnd" ? { mode: s.previousMode } : s);
// A timed quiet is over once its clock time has passed.
export const expire = (s: Interruptions, now: number): Interruptions => (s.mode === "dnd" && s.quietUntil !== null && now >= s.quietUntil ? endQuiet(s) : s);

// A saved setting is untrusted: anything unreadable falls back to the default, and a quiet that ended while closed is over.
export function parseInterruptions(raw: string | null, now: number): Interruptions {
  let j: unknown = null;
  try {
    j = raw ? JSON.parse(raw) : null;
  } catch {
    return DEFAULT_INTERRUPTIONS;
  }
  const o = j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  const loud = (v: unknown): v is Loud => v === "all" || v === "blockers";
  if (loud(o.mode)) return { mode: o.mode };
  if (o.mode !== "dnd") return DEFAULT_INTERRUPTIONS;
  const until = typeof o.quietUntil === "number" && Number.isFinite(o.quietUntil) ? o.quietUntil : null;
  return expire({ mode: "dnd", quietUntil: until, previousMode: loud(o.previousMode) ? o.previousMode : "all" }, now);
}

const isBlocker = (a: Alert) => a.why === "blocked";

// Updates that may not speak right now go to the standup instead of waiting in line, so going back
// to All updates later does not replay stale news. Blockers always stay queued.
export const sieve = (alerts: Alert[], s: Interruptions): Alert[] =>
  s.mode === "all" || !alerts.some((a) => a.state === "waiting" && !isBlocker(a))
    ? alerts
    : alerts.map((a) => (a.state === "waiting" && !isBlocker(a) ? { ...a, state: "told" } : a));

// The alert to speak on its own now: the next in line, one at a time, and none while quiet or while
// the user has not yet answered the offer to read the blockers held back.
export const nextSpoken = (alerts: Alert[], s: Interruptions, offered: boolean): Alert | undefined =>
  s.mode === "dnd" || offered ? undefined : nextUp(sieve(alerts, s));

// Agents with a blocker still in line.
export const queuedAgents = (alerts: Alert[]): string[] => [...new Set(alerts.filter((a) => a.state === "waiting" && isBlocker(a)).map((a) => a.from))];

// "Not now" to the offer: the held blockers stay on screen to answer by hand but stop waiting to be read.
export const deferQueued = (alerts: Alert[]): Alert[] => alerts.map((a) => (a.state === "waiting" && isBlocker(a) ? { ...a, state: "told" } : a));
