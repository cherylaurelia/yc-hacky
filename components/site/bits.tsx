// Small shared pieces of the marketing site, drawn in the Calling Desk vocabulary.
import Link from "next/link";
import { latestRelease } from "@/lib/site";

export function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadButton({ label = "Download for Mac" }: { label?: string }) {
  const r = latestRelease();
  if (!r.url) {
    return (
      <span className="btn-quiet" aria-disabled="true">
        Mac download coming soon
      </span>
    );
  }
  return (
    <a href={r.url} className="btn-go" download>
      <DownloadIcon />
      {label}
    </a>
  );
}

export function DownloadNote() {
  const r = latestRelease();
  return (
    <span className="text-[14px] text-[var(--faint)]">
      Free{r.version ? ` · version ${r.version}` : ""} · macOS {r.minimumSystemVersion} or later · Apple silicon and Intel
    </span>
  );
}

export function Cmd({ children }: { children: string }) {
  // On the navy ground the plate is a raised well with a hairline, not near-black on navy.
  return <code className="block overflow-x-auto whitespace-pre rounded-[9px] bg-[var(--wings-hi)] px-3.5 py-3 text-[14px] leading-[1.5] text-[var(--text)] shadow-[inset_0_0_0_1px_var(--rule)]">{children}</code>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-[var(--text)] underline decoration-[var(--rule)] hover:decoration-[var(--text)]">
      {children}
    </Link>
  );
}
