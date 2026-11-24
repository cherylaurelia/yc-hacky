// The Terminal 1 mark, shared by the marketing site and the app so the two can't drift apart.
import Link from "next/link";

export default function Wordmark({ size = 22, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 text-ink no-underline" aria-label="Terminal 1 home">
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
        <rect width="22" height="22" rx="6" fill="#1f1d18" />
        <path d="M6 11h1.5M9 7.5v7M12 9v4M15 6.5v9" stroke="#fdfcf6" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className={`font-display ${compact ? "hidden sm:inline" : ""}`} style={{ fontSize: size * 1.1, lineHeight: 1, letterSpacing: "-0.02em" }}>
        Terminal 1
      </span>
    </Link>
  );
}
