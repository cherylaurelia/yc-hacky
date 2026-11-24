import type { Metadata } from "next";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import "./site.css";


// Checkout links, the download URL and company details come from the host's env at request time
// (lib/site.ts), so they can change without rebuilding the image.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Terminal 1: dictate anywhere, answer your coding agents by voice", template: "%s · Terminal 1" },
  description:
    "A Mac menu-bar app. Hold a key and talk: your words land in whatever you're writing. When Claude Code, Codex or Cursor needs you, it asks out loud, and you answer without switching windows.",
};


const NAV = [
  ["Download", "/download"],
  ["Pricing", "/pricing"],
  ["Docs", "/docs"],
] as const;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <header className="mx-auto flex h-20 max-w-[1180px] items-center justify-between px-5 sm:px-8">
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
        {/* The closing mark both reference sites end on: the name, set large, sinking off the page. */}
        <p aria-hidden="true" className="mx-auto max-w-[1180px] select-none overflow-hidden px-5 pt-4 text-center font-display text-[clamp(88px,19vw,280px)] leading-[0.78] tracking-[-0.04em] text-[var(--wings-hi)] sm:px-8">
          Terminal 1
        </p>
      </footer>
    </div>
  );
}
