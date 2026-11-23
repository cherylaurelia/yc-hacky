// The Mac app's local relay -> this page, and answers back. The app dispatches a `coworker-relay`
// CustomEvent per agent event; the page answers with postMessage({ answer: { id, text } }).
import type { BoardAlert, Ctx } from "./board.ts";

export type RelayEvent = { id: string; agent: string; kind: string; text: string; context?: Ctx };

type Bridge = { webkit?: { messageHandlers?: { coworker?: { postMessage(m: unknown): void } } } };

let n = 0;

// Questions wait for an answer like approvals do; done is news. Ids are negative so they never meet a board comment id.
export function alertFromRelay(e: RelayEvent): BoardAlert {
  const kind = e.kind === "approval" || e.kind === "stuck" || e.kind === "done" ? e.kind : "blocked";
  return { id: -++n, from: e.agent, login: "", why: kind === "done" ? "mention" : "blocked", text: e.text, at: new Date().toISOString(), kind, req: e.id.toLowerCase(), ctx: e.context ?? null };
}

export const answerMessage = (id: string, text: string) => ({ answer: { id, text } });

// True when the Mac app took the answer.
export function sendToApp(id: string, text: string): boolean {
  const h = (globalThis as unknown as Bridge).webkit?.messageHandlers?.coworker;
  if (!h) return false;
  h.postMessage(answerMessage(id, text));
  return true;
}

export const isRelayEvent = (v: unknown): v is RelayEvent => {
  const e = v as Partial<RelayEvent> | null;
  return !!e && typeof e.id === "string" && typeof e.agent === "string" && typeof e.kind === "string" && typeof e.text === "string";
};
