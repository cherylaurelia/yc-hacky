// Browser-side life of board alerts. One alert is handled at a time: its poster's voice, then the
// agent's question, then the user's answer. The rest wait in line and are read only after the
// current one is answered, so voices never overlap and an answer always has one clear owner.
import type { BoardAlert } from "./board.ts";

// waiting: queued behind another. playing: the poster's voice is on. asking: handed to the agent,
// the user owes an answer. told: handed over and left unanswered (skipped, timed out, or info only).
// answered: the reply is on the board.
export type AlertState = "waiting" | "playing" | "asking" | "told" | "answered";
export type Alert = BoardAlert & { seq: number; state: AlertState };

export const current = (alerts: Alert[]) => alerts.find((a) => a.state === "playing" || a.state === "asking");
// The oldest waiting alert, and only while none is being handled.
export const nextUp = (alerts: Alert[]) => (current(alerts) ? undefined : alerts.find((a) => a.state === "waiting"));
// Approvals, blocked and stuck alerts nobody has answered yet.
export const waiting = (alerts: Alert[]) => alerts.filter((a) => a.why === "blocked" && a.state !== "answered");

export const normReq = (v: unknown) => (typeof v === "string" ? v.replace(/^req\s+/i, "").trim().toLowerCase() : "");

export const markAnswered = (alerts: Alert[], reqs: ReadonlySet<string>): Alert[] =>
  alerts.map((a) => (a.req && reqs.has(a.req) && a.state !== "answered" ? { ...a, state: "answered" } : a));

// An answer is bound to the alert that was asked, never to the latest post: while one is being
// handled, only its own request id may be answered. Returns the sentence to say, or null if fine.
export function checkAnswer(alerts: Alert[], req: string): string | null {
  const now = current(alerts);
  if (now?.req && req !== now.req) return `I just asked about request ${now.req}, not ${req}. Answer that one first.`;
  const hit = alerts.find((a) => a.req === req);
  if (hit?.state === "answered") return `Request ${req} was already answered.`;
  if (hit?.state === "waiting") return `I have not asked about request ${req} yet.`;
  return null;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// The alert "show me" means: by request id, else by agent name, else the most recent.
export function findAlert(alerts: Alert[], agent?: string, req?: string): { alert: Alert } | { error: string } {
  if (!alerts.length) return { error: "There are no alerts to show yet." };
  const r = normReq(req);
  const byReq = r ? alerts.findLast((a) => a.req === r) : undefined;
  if (byReq) return { alert: byReq };
  const who = key(agent ?? "");
  const hit = who ? alerts.findLast((a) => key(a.from).includes(who) || who.includes(key(a.from))) : alerts.at(-1);
  return hit ? { alert: hit } : { error: `I have no alert from ${agent}. Alerts are from ${[...new Set(alerts.map((a) => a.from))].join(", ")}.` };
}
