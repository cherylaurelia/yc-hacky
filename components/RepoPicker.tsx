"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseRepo, readRecent } from "@/lib/repo";

export type Repo = { name: string; private: boolean };
type Row = Repo & { typed?: boolean };

const GithubMark = () => (
  <svg aria-hidden viewBox="0 0 16 16" width="18" height="18" fill="currentColor" className="shrink-0 text-soft">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

// Search box over a list of repos. Signed in: your repos, the ones you used last first, then most
// recently pushed. Anyone: type owner/name or paste a GitHub link, then press Enter.
// Arrows move the highlight, Enter picks it, typing filters at once. Mount it fresh each time it opens.
export default function RepoPicker({ repos, loading = false, onPick, label }: { repos: Repo[]; loading?: boolean; onPick: (repo: string) => void; label?: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  // localStorage exists only in the browser, so the recent repos load after hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent());
  }, []);

  const rows = useMemo<Row[]>(() => {
    const known = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
    const order = [...new Map([...recent, ...repos.map((r) => r.name)].map((n) => [n.toLowerCase(), n])).values()];
    const needle = q.trim().toLowerCase();
    const out: Row[] = order.map((n) => known.get(n.toLowerCase()) ?? { name: n, private: false }).filter((r) => r.name.toLowerCase().includes(needle));
    const typed = needle ? parseRepo(q) : null;
    if (typed?.ok && !out.some((r) => r.name.toLowerCase() === typed.repo.toLowerCase())) out.push({ name: typed.repo, private: false, typed: true });
    return out;
  }, [repos, recent, q]);

  const at = Math.min(active, Math.max(0, rows.length - 1));
  useEffect(() => {
    list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [at, rows]);

  const move = (to: number) => setActive(rows.length ? (to + rows.length) % rows.length : 0);
  const miss = q.trim() && rows.length === 0 ? parseRepo(q) : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <svg aria-hidden viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          role="combobox"
          aria-label={label ?? "Search repositories"}
          aria-expanded={rows.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={rows.length ? `${id}-${at}` : undefined}
          aria-autocomplete="list"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") move(at + 1);
            else if (e.key === "ArrowUp") move(at - 1);
            else if (e.key === "Enter" && rows[at]) onPick(rows[at].name);
            else return;
            e.preventDefault();
          }}
          placeholder={repos.length || loading ? "Search repositories…" : "owner/name or a GitHub link"}
          className="h-12 w-full rounded-[var(--btn-radius)] border border-line bg-paper pl-11 pr-4 text-base text-ink outline-none placeholder:text-faint focus:border-ink/40"
        />
      </div>

      {miss && !miss.ok && (
        <p role="alert" className="px-2 text-sm text-stop">
          {miss.error}
        </p>
      )}
      {loading && rows.length === 0 && !miss && <p className="px-2 text-sm text-soft">Loading your repos…</p>}

      {rows.length > 0 && (
        <ul ref={list} role="listbox" id={`${id}-list`} aria-label="Repositories" className="-mx-2 flex max-h-[min(22rem,48vh)] flex-col overflow-y-auto">
          {rows.map((r, i) => (
            <li
              key={r.name}
              id={`${id}-${i}`}
              role="option"
              data-repo={r.name}
              aria-selected={i === at}
              onMouseMove={() => i !== at && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r.name)}
              className={`flex h-11 shrink-0 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] text-ink ${i === at ? "bg-chip" : ""}`}
            >
              <GithubMark />
              <span className="truncate">{r.typed ? `Open ${r.name}` : r.name}</span>
              {r.private && <span className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-soft">Private</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The quiet chip in the corner ("yc-hacky ▾", the owner is in its tooltip) that opens the picker
// as a modal. A native <dialog> gives the focus trap, Esc and the backdrop.
export function RepoChip({ repo, repos, loading, onPick }: { repo: string; repos: Repo[]; loading: boolean; onPick: (repo: string) => void }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector("input")?.focus(); // showModal() would focus the close button first
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-repo-chip
        title={repo || undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-8 max-w-[11rem] items-center gap-1.5 rounded-[var(--btn-radius)] border border-line bg-card/60 pl-3 pr-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-card"
      >
        <span className="truncate">{repo ? (repo.split("/")[1] ?? repo) : "Choose a repo"}</span>
        <svg aria-hidden viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-soft">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        className="card-rise m-auto w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-[14px] border-0 bg-card p-0 text-ink backdrop:bg-ink/30"
      >
        {open && (
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 id={title} className="font-display text-2xl leading-tight">
                Choose a repository
              </h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-soft hover:bg-chip hover:text-ink">
                <svg aria-hidden viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="m2 2 8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
            <RepoPicker
              repos={repos}
              loading={loading}
              onPick={(r) => {
                setOpen(false);
                onPick(r);
              }}
            />
          </div>
        )}
      </dialog>
    </>
  );
}
