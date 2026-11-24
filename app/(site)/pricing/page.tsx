import type { Metadata } from "next";
import Link from "next/link";
import { DownloadButton } from "@/components/site/bits";
import { PLANS } from "@/lib/pricing";
import { checkout, company } from "@/lib/site";

export const metadata: Metadata = { title: "Pricing", description: "Terminal 1 is free to start. Pro adds dictation and voice for $12 a month; Team is $20 a seat." };

const WRAP = "mx-auto max-w-[1180px] px-5 sm:px-8";

function Buy({ href, children, primary }: { href: string; children: string; primary?: boolean }) {
  // A plan whose checkout link isn't configured yet says so instead of linking nowhere.
  if (!href) {
    return (
      <span className="btn-quiet" aria-disabled="true">
        Checkout opens soon
      </span>
    );
  }
  return (
    <a href={href} className={primary ? "btn-go" : "btn-quiet"}>
      {children}
    </a>
  );
}

const BILLING: [string, string][] = [
  ["How do I get Pro into the app?", "After checkout you get a license key by email. Paste it into Terminal 1 > Settings > License and click Activate. One key covers your Mac and the web app."],
  ["Who handles payment and tax?", "Lemon Squeezy is our reseller: it takes the payment, adds the right sales tax or VAT for your country, and sends the receipt."],
  ["Can I cancel?", "Any time, from the link in your receipt. Pro stays on until the end of the period you paid for, then the app drops back to Free. Nothing is deleted."],
  ["What happens to my agents if Pro lapses?", "They keep reaching you. Alerts, notification buttons, the coworker command and the team board are all in Free."],
  ["How does Team billing work?", "One subscription with a seat count, on one invoice. Change the count from the customer portal; the change is prorated."],
];

export default function Pricing() {
  const [free, pro, team] = PLANS;
  return (
    <main className={`${WRAP} pt-14`}>
      <h1 className="max-w-[18ch] text-[44px] sm:text-[60px]">Free to start. Pro when you want to talk.</h1>
      <p className="mt-5 max-w-[56ch] text-[18px] leading-[1.55] text-[var(--dim)]">
        Free covers everything that lets your agents reach you. Pro is for talking: dictation, the voice that speaks for your agents, and GitHub by voice.
      </p>

      <div className="mt-14 grid gap-px overflow-hidden rounded-[14px] bg-[var(--rule)] lg:grid-cols-3">
        {[free, pro, team].map((p) => (
          <section key={p.id} className={`flex flex-col gap-5 p-7 ${p.id === "pro" ? "lit" : "bg-[var(--wings-raise)]"}`} aria-labelledby={`plan-${p.id}`}>
            <h2 id={`plan-${p.id}`} className="text-[26px]">
              {p.name}
            </h2>
            <p>
              <span className="text-[44px] font-semibold tracking-[-0.03em]">
                {p.price}
              </span>{" "}
              <span className={p.id === "pro" ? "text-[var(--page-dim)]" : "text-[var(--dim)]"}>{p.per}</span>
              {p.note && <span className={`block text-[14px] ${p.id === "pro" ? "text-[var(--page-dim)]" : "text-[var(--faint)]"}`}>{p.note}</span>}
            </p>
            <p className="text-[17px] font-semibold">{p.pitch}</p>
            <ul className={`flex flex-1 flex-col gap-2.5 text-[15.5px] leading-[1.5] ${p.id === "pro" ? "text-[var(--page-dim)]" : "text-[var(--dim)]"}`}>
              {p.includes.map((i) => (
                <li key={i} className="flex gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="mt-[5px] flex-none">
                    <path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {i}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2.5">
              {p.id === "free" && <DownloadButton label="Download free" />}
              {p.id === "pro" && (
                <>
                  {checkout.proMonthly ? (
                    <a href={checkout.proMonthly} className="inline-flex h-11 items-center rounded-[var(--btn-radius)] bg-[var(--page-ink)] px-[18px] font-semibold text-[var(--page)] no-underline hover:bg-[var(--brand)]">
                      Get Pro monthly
                    </a>
                  ) : (
                    <span className="inline-flex h-11 items-center rounded-[var(--btn-radius)] px-4 font-semibold text-[var(--page-dim)] shadow-[inset_0_0_0_1px_var(--page-edge)]">Checkout opens soon</span>
                  )}
                  {checkout.proYearly && (
                    <a href={checkout.proYearly} className="inline-flex h-11 items-center rounded-[var(--btn-radius)] px-4 font-semibold text-[var(--page-ink)] no-underline shadow-[inset_0_0_0_1px_var(--page-edge)] hover:bg-[var(--page-well)]">
                      Yearly, $96
                    </a>
                  )}
                </>
              )}
              {p.id === "team" && <Buy href={checkout.team}>Get Team</Buy>}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-4 text-[14px] text-[var(--faint)]">Prices in US dollars. Sales tax or VAT is added at checkout where it applies.</p>

      <section className="mt-28 grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <h2 className="text-[34px] sm:text-[44px]">Billing questions</h2>
        <div className="border-t border-[var(--rule)]">
          {BILLING.map(([q, a]) => (
            <div key={q} className="border-b border-[var(--rule)] py-5">
              <h3 className="text-[18px]">{q}</h3>
              <p className="mt-2 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--dim)]">{a}</p>
            </div>
          ))}
          {company.email && (
            <p className="py-5 text-[16px] text-[var(--dim)]">
              Anything else: <a href={`mailto:${company.email}`} className="font-semibold text-[var(--text)] underline decoration-[var(--rule)]">{company.email}</a>
            </p>
          )}
        </div>
      </section>

      <p className="mt-16 text-[16px] text-[var(--dim)]">
        Not sure yet? <Link href="/download" className="font-semibold text-[var(--text)] underline decoration-[var(--rule)]">Install the free version</Link> and upgrade from inside the app.
      </p>
    </main>
  );
}
