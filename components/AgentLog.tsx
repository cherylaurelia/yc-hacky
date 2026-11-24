"use client";

// The agent log panel: every issue agents raised on the board, newest first, and the tasks they
// were given when the user asks for them ("Show tasks"). Data from GET /api/board/log.
import { useCallback, useEffect, useState } from "react";
import type { IssueStatus, LogIssue, LogTask, TaskStatus } from "@/lib/agent-log";
import { ago } from "@/lib/spoken";

type Log = { board: number; hours: number; issues: LogIssue[]; tasks?: LogTask[] };

const HOURS = [3, 12, 24, 72] as const;
const KIND_WORD = { approval: "Needs approval", blocked: "Blocked", stuck: "Stuck" } as const;
const ISSUE_CHIP: Record<IssueStatus, string> = { open: "bg-stoptint text-stop", answered: "bg-addtint text-add", resolved: "bg-chip text-soft" };
const TASK_CHIP: Record<TaskStatus, string> = { waiting: "bg-chip text-soft", working: "bg-chip text-ink", done: "bg-addtint text-add", blocked: "bg-stoptint text-stop" };
const TASK_WORD: Record<TaskStatus, string> = { waiting: "Not started", working: "Working", done: "Done", blocked: "Blocked" };

export default function AgentLog({ repo, board, embed, onClose }: { repo: string; board?: number; embed: boolean; onClose: () => void }) {
  const [hours, setHours] = useState<number>(12);
  const [tasks, setTasks] = useState(false);
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams({ repo, hours: String(hours), ...(tasks ? { tasks: "1" } : {}), ...(board ? { board: String(board) } : {}) });
      const res = await fetch(`/api/board/log?${q}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as Log & { error?: string };
      if (!res.ok) throw new Error(j.error || `The log answered ${res.status}.`);
      setLog(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "I could not read the log.");
    } finally {
      setBusy(false);
    }
  }, [repo, board, hours, tasks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const open = log?.issues.filter((i) => i.status === "open").length ?? 0;

  return (
    <section
      id="agent-log"
      aria-label="Agent log"
      aria-busy={busy}
      className={`card-rise mx-auto mt-3 flex w-full flex-col rounded-[14px] bg-card text-[14px] text-ink ${embed ? "max-h-[70vh] max-w-sm gap-3 overflow-y-auto p-4" : "max-h-[75vh] max-w-xl gap-4 overflow-y-auto p-6"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg">Agent log</h2>
        <span className="text-[13px] text-soft">{log ? `${log.issues.length} ${log.issues.length === 1 ? "issue" : "issues"}${open ? `, ${open} open` : ""} · board #${log.board}` : busy ? "Reading the board…" : ""}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <label className="flex items-center gap-2">
          <span className="text-soft">Last</span>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-8 rounded-full border border-line bg-paper px-3 text-ink">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h} hours
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={tasks} onChange={(e) => setTasks(e.target.checked)} className="accent-[var(--ink)]" />
          Show tasks agents are working on
        </label>
        <button type="button" onClick={load} disabled={busy} className="text-soft underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-stop">
          {error}
        </p>
      )}

      {log && (
        <>
          {log.issues.length === 0 ? (
            <p className="text-soft">No agent issues in the last {log.hours} hours.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line">
              {log.issues.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="font-semibold text-ink">{i.agent}</span>
                    <span className="text-soft">{KIND_WORD[i.kind]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${ISSUE_CHIP[i.status]}`}>{i.status === "open" ? "Open" : i.status === "answered" ? "Answered" : "Resolved"}</span>
                    {i.req && <span className="font-mono text-[12px] text-faint">req {i.req}</span>}
                    <span className="ml-auto text-faint">{ago(i.at)}</span>
                  </div>
                  <p className="line-clamp-3 text-soft">{i.text}</p>
                </li>
              ))}
            </ol>
          )}

          {log.tasks && (
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-base">Tasks</h3>
              {log.tasks.length === 0 ? (
                <p className="text-soft">No tasks given in the last {log.hours} hours.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-line">
                  {log.tasks.map((t) => (
                    <li key={t.id} className="flex flex-col gap-1 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                        <span className="font-semibold text-ink">{t.for}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${TASK_CHIP[t.status]}`}>{TASK_WORD[t.status]}</span>
                        {t.pr && <span className="text-soft">PR #{t.pr}</span>}
                        <span className="ml-auto text-faint">{ago(t.updated ?? t.at)}</span>
                      </div>
                      <p className="line-clamp-3 text-soft">{t.text}</p>
                      <p className="text-[12px] text-faint">from {t.from}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      )}

      <button type="button" onClick={onClose} className="self-start text-[13px] text-soft underline-offset-4 hover:text-ink hover:underline">
        Close
      </button>
    </section>
  );
}
