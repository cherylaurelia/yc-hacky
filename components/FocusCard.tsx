"use client";

import { useEffect, useState } from "react";
import type { Alert } from "@/lib/alerts";
import { diffRows } from "@/lib/diff";
import { ago } from "@/lib/spoken";

const KIND: Record<string, { label: string; tone: string }> = {
  approval: { label: "Wants approval", tone: "border-signal/50 bg-signal/10 text-signal" },
  blocked: { label: "Blocked", tone: "border-warn/50 bg-warn/10 text-warn" },
  stuck: { label: "Stuck in a loop", tone: "border-bad/60 bg-bad/10 text-bad" },
  done: { label: "Done", tone: "border-ok/50 bg-ok/10 text-ok" },
  mention: { label: "Mentions you", tone: "border-signal/50 bg-signal/10 text-signal" },
};

const ROW: Record<string, string> = {
  add: "bg-ok/12 text-ok",
  del: "bg-bad/12 text-bad",
  hunk: "bg-raise text-dim",
  meta: "text-dim",
  ctx: "text-text/80",
};

// The full-screen view behind "show me" and a click on an alert: what the agent is doing, the
// command, the file, and the diff with +/- colours and line numbers.
export default function FocusCard({ alert, onClose, canOpen }: { alert: Alert; onClose: () => void; canOpen: boolean }) {
  const c = alert.ctx;
  const look = KIND[alert.kind ?? (alert.why === "mention" ? "mention" : "blocked")] ?? KIND.blocked;
  const rows = c?.diff ? diffRows(c.diff) : [];
  const [opening, setOpening] = useState<{ state: "busy" | "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function openInEditor() {
    if (!c?.cwd || !c.file) return;
    setOpening({ state: "busy", text: "Opening" });
    try {
      const res = await fetch("/api/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cwd: c.cwd, file: c.file, line: c.line }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Could not open it (HTTP ${res.status}).`);
      setOpening({ state: "ok", text: "Opened in your editor" });
    } catch (e) {
      setOpening({ state: "error", text: e instanceof Error ? e.message : "Could not open it." });
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${alert.from}: ${look.label}`} data-focus-card={alert.kind ?? "alert"} onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-ink/95 p-3 backdrop-blur-sm sm:p-8">
      <div onClick={(e) => e.stopPropagation()} className="mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-3xl border border-line bg-panel p-5 sm:p-7">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${look.tone}`}>{look.label}</span>
          <h2 className="text-2xl font-semibold tracking-tight">{alert.from}</h2>
          <span className="text-sm text-dim">{ago(alert.at)}</span>
          <button type="button" onClick={onClose} className="ml-auto rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:border-signal hover:text-signal">
            Close <span className="text-dim">Esc</span>
          </button>
        </header>

        <p className="max-w-[70ch] text-lg leading-snug">{alert.text}</p>

        {c?.stuck && (
          <div className="flex flex-wrap items-center gap-2" data-stuck>
            <Chip>{c.stuck.count} retries</Chip>
            <Chip>{c.stuck.minutes} min</Chip>
            <Chip>${c.stuck.cost_usd.toFixed(2)} so far</Chip>
            {c.stuck.signature && <code className="truncate rounded-md bg-raise px-2 py-1 font-mono text-xs text-dim">{c.stuck.signature}</code>}
          </div>
        )}

        {c?.command && (
          <section>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-dim">{c.tool ? `${c.tool} command` : "Command"}</h3>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-ink px-4 py-3 font-mono text-sm">{c.command}</pre>
          </section>
        )}

        {c?.file && (
          <div className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-sm">
              {c.file}
              {c.line ? `:${c.line}` : ""}
            </code>
            {canOpen && c.cwd && (
              <button type="button" onClick={openInEditor} disabled={opening?.state === "busy"} className="rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:border-signal hover:text-signal disabled:opacity-50">
                Open in editor
              </button>
            )}
            {opening && <span className={`text-sm ${opening.state === "error" ? "text-bad" : "text-dim"}`}>{opening.text}</span>}
          </div>
        )}

        {rows.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-dim">Diff</h3>
            <div className="overflow-x-auto rounded-xl border border-line bg-ink py-1 font-mono text-[13px] leading-6" data-diff>
              {rows.map((r, i) => (
                <div key={i} data-row={r.kind} className={`flex min-w-max ${ROW[r.kind]}`}>
                  <span className="w-11 shrink-0 select-none pr-2 text-right text-dim/70 tabular-nums">{r.old ?? ""}</span>
                  <span className="w-11 shrink-0 select-none pr-2 text-right text-dim/70 tabular-nums">{r.new ?? ""}</span>
                  <span className="w-5 shrink-0 select-none text-center">{r.kind === "add" ? "+" : r.kind === "del" ? "-" : ""}</span>
                  <span className="whitespace-pre pr-4">{r.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!c && <p className="text-sm text-dim">This post carries no extra context, so the line above is everything the agent said.</p>}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-bad/50 bg-bad/10 px-3 py-1 text-sm font-semibold tabular-nums text-bad">{children}</span>;
}
