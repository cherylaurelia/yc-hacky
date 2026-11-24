import type { Metadata } from "next";
import { Cmd, DownloadButton, DownloadNote, PreReleaseNote, TextLink } from "@/components/site/bits";
import { latestRelease } from "@/lib/site";

export const metadata: Metadata = { title: "Download", description: "Download Terminal 1 for Mac and connect Claude Code, Codex or Cursor in a few minutes." };

const WRAP = "mx-auto max-w-[920px] px-5 sm:px-8";

const PERMISSIONS: [name: string, why: string][] = [
  ["Microphone", "To hear you while you hold the talk key. Nothing is recorded when the key is up."],
  ["Accessibility", "To paste dictated text into the app you're using."],
  ["Input Monitoring", "To notice the talk key while another app is in front."],
  ["Notifications", "So an agent that needs you can reach you, with Allow and Deny buttons."],
];

const AGENTS: [name: string, cmd: string, note: string][] = [
  ["Claude Code", "coworker install claude", "Adds Terminal 1 to Claude Code's hooks in ~/.claude/settings.json and keeps the hooks you already have."],
  ["Codex", "coworker install codex", "Adds a PermissionRequest and Stop hook to ~/.codex/hooks.json. Codex asks you to trust new hooks once; run /hooks in Codex."],
  ["Cursor", "coworker install cursor", "Adds beforeShellExecution and stop hooks to ~/.cursor/hooks.json."],
  ["Anything else", 'coworker ask "Deploy now or after review?"', "Prints your answer and exits 0, or exits 2 if nobody answers in time. Works from any script or agent."],
];

export default function Download() {
  const r = latestRelease();
  return (
    <main className={`${WRAP} pt-14`}>
      <h1 className="text-[44px] sm:text-[60px]">Terminal 1 for Mac</h1>
      <p className="mt-5 max-w-[54ch] text-[18px] leading-[1.55] text-[var(--dim)]">Dictation in any app, and your coding agents a key-press away.</p>
      <div className="mt-8 flex flex-col items-start gap-3">
        <DownloadButton label={r.version ? `Download Terminal 1 ${r.version}` : "Download Terminal 1"} />
        <DownloadNote />
      </div>
      <PreReleaseNote />

      <section className="mt-20">
        <h2 className="text-[30px] sm:text-[38px]">1. Install</h2>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--dim)]">
          Open <code>Terminal-1.dmg</code> and drag Terminal 1 onto the Applications folder, then open it from Applications. It lives in the menu bar, not the Dock: look for the waveform icon at the top right of your screen.
        </p>
        <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.6] text-[var(--faint)]">
          If macOS says it can&apos;t check the app for malicious software, right-click Terminal 1 in Applications, choose Open, then Open again. You only do this once.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-[30px] sm:text-[38px]">2. Allow four things</h2>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--dim)]">The first launch asks for each, one at a time, and skips what you&apos;ve already allowed. You can change them later in System Settings &gt; Privacy &amp; Security.</p>
        <dl className="mt-6 border-t border-[var(--rule)]">
          {PERMISSIONS.map(([n, why]) => (
            <div key={n} className="grid gap-1 border-b border-[var(--rule)] py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
              <dt className="font-semibold">{n}</dt>
              <dd className="text-[var(--dim)]">{why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16">
        <h2 className="text-[30px] sm:text-[38px]">3. Pick your talk key</h2>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--dim)]">
          The default is <span className="keycap px-1.5 py-0.5 text-[14px] font-semibold">fn</span>, or <span className="keycap px-1.5 py-0.5 text-[14px] font-semibold">Right Option</span> if Wispr Flow is installed, since it uses fn. Hold to talk, let go to send. A tap shorter than a sixth of a second does nothing, so brushing the key is safe.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-[30px] sm:text-[38px]">4. Connect your agents</h2>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--dim)]">
          Run these in Terminal once. <code>coworker uninstall &lt;agent&gt;</code> puts the agent&apos;s settings back exactly as they were. <code>coworker doctor</code> says what&apos;s connected.
        </p>
        <div className="mt-6 flex flex-col gap-8">
          {AGENTS.map(([n, cmd, note]) => (
            <div key={n} className="grid gap-3 sm:grid-cols-[200px_1fr] sm:gap-6">
              <h3 className="pt-2.5 text-[19px]">{n}</h3>
              <div className="flex flex-col gap-2">
                <Cmd>{cmd}</Cmd>
                <p className="text-[15px] leading-[1.55] text-[var(--faint)]">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-[30px] sm:text-[38px]">5. Turn on Pro (optional)</h2>
        <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--dim)]">
          Dictation and the voice are Pro. After checkout, paste your license key into Terminal 1 &gt; Settings &gt; License. <TextLink href="/pricing">See plans</TextLink>
        </p>
      </section>

      <p className="mt-16 text-[16px] text-[var(--dim)]">
        Stuck somewhere? The <TextLink href="/docs#troubleshooting">troubleshooting guide</TextLink> covers the usual suspects.
      </p>
    </main>
  );
}
