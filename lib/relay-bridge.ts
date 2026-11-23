// The Mac app's local relay -> this page, and answers back. The app dispatches a `coworker-relay`
// CustomEvent per agent event; the page answers with postMessage({ answer: { id, text } }).
import type { BoardAlert, Ctx } from "./board.ts";

// The relay passes the hook's context fields (command, file, diff, ...) at the top level of the event.
export type RelayEvent = { id: string; agent: string; kind: string; text: string } & Omit<Ctx, "kind">;

type Bridge = { webkit?: { messageHandlers?: { coworker?: { postMessage(m: unknown): void } } } };

let n = 0;

// Questions wait for an answer like approvals do; done is news. Ids are negative so they never meet a board comment id.
export function alertFromRelay(e: RelayEvent): BoardAlert {
  const kind = e.kind === "approval" || e.kind === "stuck" || e.kind === "done" ? e.kind : "blocked";
  const { id, agent, text, kind: sent, ...ctx } = e;
  // Only approvals and questions have an agent waiting on the answer; a req on anything else would swallow replies.
  const req = sent === "approval" || sent === "question" ? id.toLowerCase() : null;
  return { id: -++n, from: agent, login: "", why: kind === "done" ? "mention" : "blocked", text, at: new Date().toISOString(), kind, req, ctx: { ...ctx, kind } };
}

export const answerMessage = (id: string, text: string) => ({ answer: { id, text } });

// Approvals and stuck loops take the verdict, never the note (a "deny" with a note must stay a deny).
// A question (kind "blocked") is answered in words, so its answer is the note.
export const relayAnswerText = (kind: string | null, decision: string, note?: string) =>
  kind === "blocked" && note?.trim() ? note.trim() : decision;

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
