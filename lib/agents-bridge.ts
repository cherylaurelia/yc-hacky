// The page asks the Mac app to start, list or stop coding agents (`coworker run` on this machine) and awaits its
// reply over messageHandlers.coworkerAsync. Without the app, a task goes to the team board as a TASK post.
import { clip } from "./spoken.ts";

export type Run = { id: string; task: string; agent: string; state: "running" | "done" | "failed" | "stopped"; pr?: string };
type AgentArgs = { task?: string; agent?: string; repo?: string; id?: string };
type AsyncBridge = { webkit?: { messageHandlers?: { coworkerAsync?: { postMessage(m: unknown): Promise<unknown> } } } };

const handler = () => (globalThis as unknown as AsyncBridge).webkit?.messageHandlers?.coworkerAsync;
export const hasApp = () => !!handler();

export function agentMessage(op: "start" | "list" | "stop", a: AgentArgs = {}) {
  if (op === "start") return { agent: { op, task: a.task ?? "", agent: a.agent === "codex" ? "codex" : "claude", repo: a.repo ?? "" } };
  if (op === "stop") return { agent: { op, id: a.id ?? "" } };
  return { agent: { op } };
}

export async function askApp<T>(msg: unknown): Promise<T> {
  const h = handler();
  if (!h) throw new Error("The Coworker Mac app is not connected.");
  return (await h.postMessage(msg)) as T;
}

const agentName = (agent: string) => (agent === "codex" ? "Codex" : "Claude");
// Board workers (scripts/board-worker.sh) run Claude Code, so a board task always goes to Claude.
export const boardTask = (owner: string, task: string, agent: string) => `TASK for ${owner}'s Claude: ${task}${agent === "codex" ? " (asked for Codex)" : ""}`;

const prNumber = (url?: string) => url?.match(/\/pull\/(\d+)/)?.[1];

// One short spoken line per run, newest first, at most three.
export function spokenRuns(runs: Run[]): string {
  if (!runs.length) return "No agents started from here yet.";
  const say = (r: Run) => {
    const what = `${agentName(r.agent)} on ${clip(r.task, 50)}`;
    if (r.state === "running") return `${what} is still running`;
    if (r.state === "done") return prNumber(r.pr) ? `${what} is done, pull request number ${prNumber(r.pr)}` : `${what} finished with no changes`;
    return `${what} ${r.state}`;
  };
  const running = runs.filter((r) => r.state === "running").length;
  return `${running} running. ${runs.slice(0, 3).map(say).join("; ")}.`;
}
