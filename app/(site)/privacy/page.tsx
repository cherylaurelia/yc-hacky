import type { Metadata } from "next";
import { Contact, Legal } from "@/components/site/Legal";
import { company } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy", description: "What Terminal 1 collects, where it goes, and what stays on your Mac." };

export default function Privacy() {
  return (
    <Legal title="Privacy policy">
      <p>
        This policy explains what {company.name} (&ldquo;we&rdquo;) handles when you use the Terminal 1 Mac app, the <code>coworker</code> command, and the web app, and who else is involved. Short version: your voice is processed only while you hold the talk key, approvals between your agents and the app stay on your Mac, and we don&apos;t sell data.
      </p>

      <h2>1. Your voice</h2>
      <p>
        The microphone is on only while you hold the talk key. That audio streams to <strong>ElevenLabs</strong> to turn it into text (dictation) and to run the voice conversation (Pro). We don&apos;t store your audio. ElevenLabs processes it under its own terms and privacy policy.
      </p>

      <h2>2. What stays on your Mac</h2>
      <ul>
        <li>Requests from your coding agents and your answers travel through a relay inside the app, on 127.0.0.1, protected by a token only your user account can read.</li>
        <li>Settings, your talk key, and your license key (kept in the macOS Keychain).</li>
        <li>Dictated text is pasted into the app you&apos;re using; your clipboard is restored afterwards.</li>
      </ul>

      <h2>3. What goes to GitHub</h2>
      <p>
        If you sign in with GitHub, the web app keeps your GitHub access token in an encrypted cookie in your browser, and uses it to read repositories and to post what you ask for (comments, issues, reviews, merges, team board posts) as you. If you use the team board, your agents&apos; posts are comments on a GitHub issue, visible to anyone who can read that repository.
      </p>

      <h2>4. Payments and your license</h2>
      <p>
        <strong>Lemon Squeezy</strong> sells Terminal 1 as our reseller. It collects your payment details, email and billing address, handles tax, and issues your license key; we never see your card. The app sends your license key to Lemon Squeezy to check that it&apos;s valid.
      </p>

      <h2>5. Logs</h2>
      <p>
        Our server logs errors and, when enabled, a short record of each action the voice coworker takes (which tool, for which repository, and its outcome), to debug problems and keep an audit trail of approvals. These records contain no audio.
      </p>

      <h2>6. What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell or rent personal data.</li>
        <li>We don&apos;t use your audio, code or messages to train models.</li>
        <li>We don&apos;t run advertising trackers on the app or this site.</li>
      </ul>

      <h2>7. Your choices</h2>
      <p>
        You can revoke Terminal 1&apos;s GitHub access in GitHub &gt; Settings &gt; Applications, turn off any macOS permission in System Settings, and remove the app and its agent hooks (<code>coworker uninstall &lt;agent&gt;</code>) at any time. To access or delete data we hold about you, contact <Contact />.
      </p>

      <h2>8. Changes</h2>
      <p>If this policy changes in a way that matters, we&apos;ll say so on this page and in the app before it takes effect.</p>
    </Legal>
  );
}
