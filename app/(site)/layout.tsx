import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import "./site.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: "Terminal 1: dictate anywhere, answer your coding agents by voice", template: "%s · Terminal 1" },
  description:
    "A Mac menu-bar app. Hold a key and talk: your words land in whatever you're writing. When Claude Code, Codex or Cursor needs you, it asks out loud, and you answer without switching windows.",
};

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em] no-underline" aria-label="Terminal 1 home">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect width="22" height="22" rx="6" fill="oklch(0.285 0.058 264)" />
        <path d="M6 11h1.5M9 7.5v7M12 9v4M15 6.5v9" stroke="oklch(0.97 0.008 264)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span style={{ fontStretch: "87.5%" }}>Terminal 1</span>
    </Link>
  );
}

const NAV = [
  ["Download", "/download"],
  ["Pricing", "/pricing"],
  ["Docs", "/docs"],
] as const;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${archivo.variable}`}>
      <header className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1 text-[15px]">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-[var(--dim)] no-underline transition-colors hover:bg-[var(--wings-raise)] hover:text-[var(--text)]">
              {label}
            </Link>
          ))}
          <Link href="/app" className="ml-2 hidden rounded-lg px-3 py-2 font-semibold text-[var(--text)] no-underline shadow-[inset_0_0_0_1px_var(--rule)] transition-colors hover:bg-[var(--wings-raise)] sm:inline-block">
            Open web app
          </Link>
        </nav>
      </header>
      {children}
      <footer className="mt-28 border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-10 text-[14px] text-[var(--faint)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span>For Mac, macOS 13.3 or later.</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {[...NAV, ["Privacy", "/privacy"], ["Terms", "/terms"]].map(([label, href]) => (
              <Link key={href} href={href} className="text-[var(--dim)] no-underline hover:text-[var(--text)]">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
