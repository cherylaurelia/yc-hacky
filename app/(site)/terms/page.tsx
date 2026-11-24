import type { Metadata } from "next";
import Link from "next/link";
import { Contact, Legal } from "@/components/site/Legal";
import { company } from "@/lib/site";

export const metadata: Metadata = { title: "Terms", description: "The terms for using Terminal 1." };

export default function Terms() {
  return (
    <Legal title="Terms of service">
      <p>
        These terms cover your use of Terminal 1: the Mac app, the <code>coworker</code> command, the web app and this site, provided by {company.name}. By using Terminal 1 you agree to them.
      </p>

      <h2>1. Your account and license</h2>
      <p>
        The Free plan needs no account. Pro and Team are subscriptions sold through Lemon Squeezy, our reseller, which also handles billing, tax, renewals and refunds under its own buyer terms. A license key is for the people it was bought for: one person per Pro key, and one person per seat on Team. Don&apos;t share or resell keys.
      </p>

      <h2>2. What Terminal 1 does on your behalf</h2>
      <p>
        Terminal 1 relays your answers to coding agents, and with your confirmation can act on GitHub as you (comment, open issues, review, close and merge) and start coding agents on repositories you can push to. You are responsible for what you approve and for the actions taken in your accounts. Coding agents can make mistakes; review their changes before you merge them.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Don&apos;t use Terminal 1 to break the law, or other services&apos; terms (including GitHub&apos;s and ElevenLabs&apos;).</li>
        <li>Don&apos;t try to get around licensing, rate limits or usage limits.</li>
        <li>Don&apos;t interfere with the service or other people&apos;s use of it.</li>
      </ul>

      <h2>4. Third-party services</h2>
      <p>
        Voice and dictation run on ElevenLabs, the team board and GitHub actions on GitHub, and payments on Lemon Squeezy. Their availability is outside our control, and your use of them is also covered by their terms. See the <Link href="/privacy" className="font-semibold text-[var(--text)] underline decoration-[var(--rule)]">privacy policy</Link> for what each receives.
      </p>

      <h2>5. Cancelling</h2>
      <p>You can cancel a subscription any time from your receipt or the customer portal; it stays active until the end of the paid period. We may suspend access for a serious or repeated breach of these terms.</p>

      <h2>6. No warranty</h2>
      <p>
        Terminal 1 is provided &ldquo;as is&rdquo;. To the extent the law allows, we make no warranties, and we aren&apos;t liable for indirect or consequential losses, or for more than you paid us in the twelve months before the claim. Nothing here limits rights you have under consumer law that can&apos;t be limited.
      </p>

      <h2>7. Changes</h2>
      <p>We may update these terms. If a change matters, we&apos;ll say so here and in the app before it takes effect; using Terminal 1 afterwards means you accept it.</p>

      <h2>8. Contact</h2>
      <p>
        Questions about these terms: <Contact />.
      </p>
    </Legal>
  );
}
