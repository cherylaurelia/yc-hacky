import Link from "next/link";
import { Cmd, DownloadButton, DownloadNote, TextLink } from "@/components/site/bits";
import Stage from "@/components/site/Stage";
import { PLANS } from "@/lib/pricing";

const WRAP = "mx-auto max-w-[1180px] px-5 sm:px-8";

// Where a dictated sentence lands: the app, what the cursor was in, and the words.
const LANDINGS: [app: string, where: string, said: string][] = [
  ["Slack", "#launch", "Deploy is done, give the staging link a click before lunch."],
  ["Terminal", "git commit -m", "Fix the invoice rounding for currencies with no minor unit"],
  ["Mail", "Re: contract", "Thanks, Priya. Thursday at three works, I'll bring the revised numbers."],
  ["Editor", "// comment", "Retry once on 429, then surface the error to the caller."],
];

// Things you can say, and what Terminal 1 does.
const ACTIONS: [said: string, done: string][] = [
  ["Open an issue: checkout breaks on Safari.", "Opened issue 84."],
  ["Have Claude fix the flaky invoice test.", "Put it on your team board. A board worker runs Claude on it and opens a pull request."],
  ["Approve 51.", "Approved pull request 51."],
  ["Merge 51.", "Merge number 51, “Round invoices per currency”? Say yes to merge."],
];

const FAQ: [q: string, a: React.ReactNode][] = [
  ["Which Macs does it run on?", "Any Mac with Apple silicon or Intel running macOS 13.3 or later."],
  ["Do I need coding agents to use it?", "No. Dictation works on its own in any app. Agents are the other half: when one needs you, it asks out loud."],
  ["Which agents work with it?", <>Claude Code, Codex and Cursor connect with one command each. Anything else, a script or another agent, can ask you through <code>coworker ask</code>.</>],
  [
    "Where does my audio go?",
    "The microphone is live only while you hold the talk key. That audio streams to ElevenLabs for transcription and the voice reply, and nowhere else. Approvals between your agents and the app stay on your Mac.",
  ],
  ["Do I need a GitHub account?", "Only for the team board and for GitHub actions by voice, like opening issues or merging. Dictation and agent alerts on your own Mac work without one."],
  ["Can I cancel Pro?", "Any time, from the receipt email or the customer portal. You keep Pro until the end of the period you paid for, then drop back to Free."],
];

export default function Home() {
  return (
    <main>
      {/* Phones lead with the promise and the download; the demo follows. From sm up the stage leads. */}
      <section className="flex flex-col gap-7 pt-2 sm:gap-10 sm:pt-6">
        <div className="order-2 sm:order-1">
          <Stage />
        </div>
        <div className={`${WRAP} order-1 grid w-full gap-6 sm:order-2 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-8`}>
          <h1 className="max-w-[16ch] text-[38px] sm:text-[56px]">Write anywhere. Answer your agents without leaving it.</h1>
          <div className="flex flex-col gap-5 lg:pb-2">
            <p className="max-w-[52ch] text-[16.5px] leading-[1.5] text-[var(--dim)] sm:text-[18px] sm:leading-[1.55]">
              Terminal 1 lives in your Mac&apos;s menu bar. Hold a key and talk: your words land in whatever you&apos;re writing. When Claude Code, Codex or Cursor needs you, it asks out loud, and you answer the same way.
            </p>
            <div id="hero-cta" className="flex flex-wrap items-center gap-3">
              <DownloadButton />
              <Link href="/pricing" className="btn-quiet">
                See pricing
              </Link>
            </div>
            <DownloadNote />
          </div>
        </div>
      </section>

      <section className={`${WRAP} mt-32 grid gap-12 lg:grid-cols-[1fr_1.1fr]`}>
        <div className="flex flex-col gap-5">
          <h2 className="max-w-[15ch] text-[34px] sm:text-[44px]">It speaks only when an agent is stuck on you.</h2>
          <p className="max-w-[48ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            Silence is the default. When an agent needs approval, is blocked, or keeps retrying the same failing command, you hear it in that agent&apos;s own voice, with what it wants in one sentence. Say &ldquo;show me&rdquo; and the exact command or diff opens before you decide.
          </p>
          <p className="max-w-[48ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            Stuck loops come with the count, the minutes and an estimate of what they cost, so stopping one is an easy call.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-[16px]">
          <p>
            <span className="font-semibold text-[var(--tape-roger)]">Sam&apos;s Claude</span> <span className="text-[var(--dim)]">wants to run the migration. Allow?</span>
          </p>
          <p>
            <span className="font-semibold">You</span> <span className="text-[var(--dim)]">Show me.</span>
          </p>
          <div className="lit rounded-[14px] px-5 pb-4 pt-4">
            <div className="flex items-center justify-between text-[13px] text-[var(--page-dim)]">
              <span className="font-semibold text-[var(--page-ink)]">Sam&apos;s Claude wants to run</span>
              <span className="font-semibold text-[var(--standby-ink)]">waiting on you · 0:21</span>
            </div>
            <code className="mt-3 block rounded-[9px] bg-[var(--page-ink)] px-3.5 py-3 text-[14px] text-[var(--page)]">npm run migrate</code>
            <div className="mt-3 overflow-hidden rounded-[9px] border border-[var(--page-rule)] text-[13px] leading-[1.6]">
              <div className="bg-[var(--page-well)] px-3 py-1.5 text-[var(--page-dim)]">
                <code>db/schema.sql</code>
              </div>
              <code className="block px-3 text-[var(--page-dim)]"> CREATE TABLE orders (</code>
              <code className="block bg-[var(--del-bg)] px-3 text-[var(--del-ink)]">-  id INTEGER PRIMARY KEY</code>
              <code className="block bg-[var(--add-bg)] px-3 text-[var(--add-ink)]">+  id INTEGER PRIMARY KEY,</code>
              <code className="block bg-[var(--add-bg)] px-3 text-[var(--add-ink)]">+  created_at TEXT NOT NULL</code>
              <code className="block px-3 text-[var(--page-dim)]"> );</code>
            </div>
          </div>
          <p>
            <span className="font-semibold">You</span> <span className="text-[var(--dim)]">Allow.</span>
          </p>
          <p className="text-[var(--faint)]">Allowed. Sam&apos;s Claude runs the migration.</p>
          <p className="text-[12.5px] text-[var(--faint)]">Sample exchange.</p>
        </div>
      </section>

      <section className={`${WRAP} mt-32`}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <h2 className="max-w-[12ch] text-[34px] sm:text-[44px]">Hold fn. Talk. Let go.</h2>
          <p className="max-w-[50ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            The text appears where your cursor is, in any app, and whatever was on your clipboard comes back afterwards. Transcription is ElevenLabs Scribe, so names, code words and punctuation come out right.
          </p>
        </div>
        <ul className="mt-10 border-t border-[var(--rule)]">
          {LANDINGS.map(([app, where, said]) => (
            <li key={app} className="grid gap-1 border-b border-[var(--rule)] py-5 sm:grid-cols-[180px_1fr] sm:gap-6">
              <span className="text-[14px] text-[var(--faint)]">
                <span className="font-semibold text-[var(--dim)]">{app}</span> · {where}
              </span>
              <span className="text-[19px] leading-[1.45] sm:text-[21px]">{said}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${WRAP} mt-32 grid gap-12 lg:grid-cols-[1fr_1.1fr]`}>
        <div className="flex flex-col gap-5">
          <h2 className="max-w-[14ch] text-[34px] sm:text-[44px]">Say what should happen next.</h2>
          <p className="max-w-[46ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            Open issues, comment, review and merge pull requests, or hand a task to an agent, out loud. Merging, closing and starting agents always wait for your spoken yes; text the voice reads in an issue or on the board can&apos;t trigger them.
          </p>
        </div>
        <dl className="flex flex-col">
          {ACTIONS.map(([said, done]) => (
            <div key={said} className="grid gap-1 border-b border-[var(--rule)] py-4 first:border-t">
              <dt className="text-[18px]">&ldquo;{said}&rdquo;</dt>
              <dd className="text-[15px] text-[var(--faint)]">{done}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${WRAP} mt-32 grid gap-12 lg:grid-cols-[1fr_1.1fr]`}>
        <div className="flex flex-col gap-5">
          <h2 className="max-w-[14ch] text-[34px] sm:text-[44px]">Your agents, connected in one line each.</h2>
          <p className="max-w-[46ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            The app ships with the <code>coworker</code> command. It wires Terminal 1 into each agent&apos;s own hooks, keeps your existing hooks, and undoes cleanly. Anything else can ask you a question and wait for the answer.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Cmd>coworker install claude</Cmd>
          <Cmd>coworker install codex</Cmd>
          <Cmd>coworker install cursor</Cmd>
          <Cmd>{'coworker ask "Ship to prod now, or after the demo?"'}</Cmd>
        </div>
      </section>

      <section className={`${WRAP} mt-32`}>
        <h2 className="max-w-[18ch] text-[34px] sm:text-[44px]">Private where it counts.</h2>
        <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-3">
          {[
            ["Approvals stay on your Mac.", "Agents reach the app over a local relay on 127.0.0.1, behind a private token. No server sits between your agent and your answer."],
            ["The mic is live only while you hold the key.", "Audio streams to ElevenLabs for transcription and voice while the key is down, and stops when you let go."],
            ["GitHub happens as you.", "Issues, reviews and merges go out from your own account after you sign in, with your own permissions."],
          ].map(([t, d]) => (
            <div key={t} className="flex flex-col gap-2 border-t border-[var(--rule)] pt-5">
              <dt className="text-[18px] font-semibold">{t}</dt>
              <dd className="text-[15.5px] leading-[1.6] text-[var(--dim)]">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${WRAP} mt-32`} id="install">
        <h2 className="text-[34px] sm:text-[44px]">Install in two minutes.</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {[
            ["Download and drag it to Applications.", "Open the disk image and drag Terminal 1 onto the Applications folder."],
            ["Allow the microphone and the talk key.", "The first launch walks you through three macOS permissions, one at a time, and tests your talk key."],
            ["Connect your agents.", "Run coworker install for each agent you use. From then on, they can ask you things."],
          ].map(([t, d], i) => (
            <li key={t} className="flex flex-col gap-3">
              <span className="keycap inline-flex h-7 w-7 items-center justify-center text-[13px] font-semibold">{i + 1}</span>
              <h3 className="text-[20px]">{t}</h3>
              <p className="text-[15.5px] leading-[1.6] text-[var(--dim)]">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <DownloadButton />
          <TextLink href="/download">Full install guide</TextLink>
        </div>
      </section>

      <section className={`${WRAP} mt-32`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[34px] sm:text-[44px]">Free to start. Pro when you want to talk.</h2>
          <TextLink href="/pricing">Compare plans</TextLink>
        </div>
        <div className="mt-10 overflow-hidden rounded-[14px] bg-[var(--wings-raise)]">
          {PLANS.map((p) => (
            <div key={p.id} className="grid gap-2 border-b border-[var(--rule)] px-6 py-5 last:border-b-0 sm:grid-cols-[160px_200px_1fr] sm:items-baseline sm:gap-6">
              <span className="text-[20px] font-semibold" style={{ fontStretch: "87.5%" }}>
                {p.name}
              </span>
              <span className="text-[15px] text-[var(--dim)]">
                <span className="text-[22px] font-semibold text-[var(--text)]">{p.price}</span> {p.per}
              </span>
              <span className="text-[15.5px] text-[var(--dim)]">{p.pitch}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${WRAP} mt-32 grid gap-12 lg:grid-cols-[1fr_1.6fr]`}>
        <h2 className="text-[34px] sm:text-[44px]">Questions</h2>
        <div className="border-t border-[var(--rule)]">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-[var(--rule)] py-5">
              <summary className="flex items-center justify-between gap-6 text-[18px] font-semibold">
                {q}
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="flex-none text-[var(--faint)] transition-transform duration-200 group-open:rotate-45">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </summary>
              <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--dim)]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${WRAP} mt-36 flex flex-col items-start gap-6`}>
        <h2 className="max-w-[20ch] text-[40px] sm:text-[56px]">Your agents are waiting on someone. Make it a quick conversation.</h2>
        <div className="flex flex-wrap items-center gap-4">
          <DownloadButton />
          <DownloadNote />
        </div>
      </section>
    </main>
  );
}
