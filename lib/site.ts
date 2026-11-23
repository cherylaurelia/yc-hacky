// Everything the marketing site links to that you set per deployment. Unset values fall back to safe defaults.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Release = { latest?: string | null; url?: string; sha256?: string; minimumSystemVersion?: string };

// scripts/release.sh writes public/releases.json; NEXT_PUBLIC_DOWNLOAD_URL overrides it (e.g. a CDN).
// url is "" until a release exists, so buttons can say so instead of linking to a missing file.
export function latestRelease(): { version: string | null; url: string; minimumSystemVersion: string } {
  let r: Release = {};
  try {
    r = JSON.parse(readFileSync(join(process.cwd(), "public/releases.json"), "utf8")) as Release;
  } catch {
    // No releases.json: nothing published yet.
  }
  return {
    version: r.latest ?? null,
    url: process.env.NEXT_PUBLIC_DOWNLOAD_URL || (r.latest ? r.url ?? "" : ""),
    minimumSystemVersion: r.minimumSystemVersion ?? "13.3",
  };
}

// Lemon Squeezy checkout links (Store > Products > Share). Unset means checkout isn't open yet.
export const checkout = {
  proMonthly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_MONTHLY || "",
  proYearly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_YEARLY || "",
  team: process.env.NEXT_PUBLIC_CHECKOUT_TEAM || "",
};

export const company = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME || "Terminal 1",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  updated: "November 23, 2026",
};
