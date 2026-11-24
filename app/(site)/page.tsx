import {
  DownloadButton,
  DownloadNote,
} from "@/components/site/bits";
import Stage from "@/components/site/Stage";

const WRAP = "mx-auto max-w-[1180px] px-5 sm:px-8";

// Where a dictated sentence lands: the app, what the cursor was in, and the words.
const LANDINGS: [app: string, where: string, said: string][] = [
  [
    "Slack",
    "#launch",
    "Deploy is done, give the staging link a click before lunch.",
  ],
  [
    "Terminal",
    "git commit -m",
    "Fix the invoice rounding for currencies with no minor unit",
  ],
  [
    "Mail",
    "Re: contract",
    "Thanks, Priya. Thursday at three works, I'll bring the revised numbers.",
  ],
  [
    "Editor",
    "// comment",
    "Retry once on 429, then surface the error to the caller.",
  ],
];

// Things you can say, and what Terminal 1 does.
const ACTIONS: [said: string, done: string][] = [
  ["Open an issue: checkout breaks on Safari.", "Opened issue 84."],
  [
    "Have Claude fix the flaky invoice test.",
    "Put it on your team board. A board worker runs Claude on it and opens a pull request.",
  ],
  ["Approve 51.", "Approved pull request 51."],
  [
    "Merge 51.",
    "Merge number 51, “Round invoices per currency”? Say yes to merge.",
  ],
];

export default function Home() {
  return (
    <main>
      <section
        className={`${WRAP} grid items-center gap-12 pb-8 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10`}
      >
        <div className="relative">
          <div className="relative flex flex-col items-start gap-6">
            <div className="relative">
              {/* The sage brush stroke behind the headline, as in a painter's sketchbook. */}
              <div
                aria-hidden="true"
                className="brush absolute -inset-x-8 -inset-y-6 sm:-inset-x-12"
              />
              <h1 className="relative max-w-[13ch] text-[46px] sm:text-[72px]">
                Write anywhere. <em>Answer your agents</em> without leaving it.
              </h1>
            </div>
            <p className="max-w-[46ch] text-[17px] leading-[1.6] text-[var(--dim)] sm:text-[19px]">
              A menu-bar app for Mac. Hold a key and talk: your words land in
              whatever you&apos;re writing. When Claude Code, Codex or Cursor
              needs you, it asks out loud, and you answer the same way.
            </p>
            <div
              id="hero-cta"
              className="flex flex-wrap items-center gap-x-5 gap-y-3"
            >
              <DownloadButton />
              <DownloadNote />
            </div>
          </div>
        </div>
        <figure className="relative mx-auto w-full max-w-[520px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- a single static image; next/image adds nothing here */}
          <img
            src="/site/curiosity.webp"
            width={860}
            height={800}
            alt="A woman writes a letter at a table while another leans over her shoulder to read it."
            className="mount block h-auto w-full"
          />
          <figcaption className="mt-3 text-right text-[12.5px] text-[var(--faint)]">
            Gerard ter Borch, <i>Curiosity</i>, about 1660. The Met, public
            domain.
          </figcaption>
        </figure>
      </section>

      {/* The product, framed on a soft sage-to-lavender wash so it reads as the thing to look at. */}
      <section className="wash mx-auto mt-20 max-w-[1260px] rounded-[28px] py-14 sm:mt-28 sm:py-20">
        <div className={`${WRAP} mb-8 flex flex-col gap-3`}>
          <h2 className="max-w-[20ch] text-[34px] sm:text-[48px]">
            Your agents ask. <em>You answer out loud.</em>
          </h2>
        </div>
        <Stage />
      </section>

      <section className={`${WRAP} mt-32 grid gap-12 lg:grid-cols-[1fr_1.1fr]`}>
        <div className="flex flex-col gap-5">
          <h2 className="max-w-[15ch] text-[34px] sm:text-[44px]">
            It speaks only when an agent is stuck on you.
          </h2>
          <p className="max-w-[48ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            Silence is the default. When an agent needs approval, is blocked, or
            keeps retrying the same failing command, you hear it in that
            agent&apos;s own voice, with what it wants in one sentence. Say
            &ldquo;show me&rdquo; and the exact command or diff opens before you
            decide.
          </p>
          <p className="max-w-[48ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            Stuck loops come with the count, the minutes and an estimate of what
            they cost, so stopping one is an easy call.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-[16px]">
          <p>
            <span className="font-semibold text-[var(--tape-jessica)]">
              Sam&apos;s Claude
            </span>{" "}
            <span className="text-[var(--dim)]">
              wants to run the migration. Allow?
            </span>
          </p>
          <p>
            <span className="font-semibold">You</span>{" "}
            <span className="text-[var(--dim)]">Show me.</span>
          </p>
          {/* The app's own alert card (components/Coworker.tsx), so the page shows the real product. */}
          <div className="lit flex flex-col gap-4 rounded-[14px] p-6" aria-label="Sample alert from the app">
            <div className="flex items-center gap-2.5 text-[13px]">
              <span aria-hidden="true" className="grid h-[26px] w-[26px] place-items-center rounded-full bg-[var(--tape-jessica)] text-[12px] font-semibold text-white">S</span>
              <span className="text-[var(--page-dim)]">just now</span>
            </div>
            <p className="font-[family-name:var(--font-serif)] text-[28px] leading-[1.1] tracking-[-0.02em]">Sam&apos;s Claude wants to run a command.</p>
            <code className="self-start rounded-xl bg-[var(--page-ink)] px-3 py-1.5 text-[13px] text-[var(--page)]">npm run migrate</code>
            <div className="flex items-center gap-3 text-[13px]">
              <span className="font-semibold underline decoration-[var(--page-edge)] underline-offset-4">Show me the change</span>
              <code className="text-[var(--page-dim)]">db/schema.sql</code>
            </div>
            <div className="overflow-hidden rounded-[10px] bg-[var(--page-well)] py-2 text-[12.5px] leading-6">
              <code className="block px-3 text-[var(--page-dim)]">{" "}CREATE TABLE orders (</code>
              <code className="block bg-[var(--del-bg)] px-3 text-[var(--del-ink)]">-  id INTEGER PRIMARY KEY</code>
              <code className="block bg-[var(--add-bg)] px-3 text-[var(--add-ink)]">+  id INTEGER PRIMARY KEY,</code>
              <code className="block bg-[var(--add-bg)] px-3 text-[var(--add-ink)]">+  created_at TEXT NOT NULL</code>
              <code className="block px-3 text-[var(--page-dim)]">{" "});</code>
            </div>
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="inline-flex h-11 items-center rounded-[var(--btn-radius)] bg-[var(--page-ink)] px-6 font-semibold text-[var(--page)]">Allow</span>
              <span className="inline-flex h-11 items-center px-5 font-semibold">Deny</span>
            </div>
          </div>
          <p>
            <span className="font-semibold">You</span>{" "}
            <span className="text-[var(--dim)]">Allow.</span>
          </p>
          <p className="text-[var(--faint)]">
            Allowed. Sam&apos;s Claude runs the migration.
          </p>
          <p className="text-[12.5px] text-[var(--faint)]">Sample exchange.</p>
        </div>
      </section>

      <section className={`${WRAP} mt-32`}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <h2 className="max-w-[12ch] text-[34px] sm:text-[44px]">
            Hold fn. Talk. Let go.
          </h2>
          <p className="max-w-[50ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            The text appears where your cursor is, in any app, and whatever was
            on your clipboard comes back afterwards. Transcription is ElevenLabs
            Scribe, so names, code words and punctuation come out right.
          </p>
        </div>
        <ul className="mt-10 border-t border-[var(--rule)]">
          {LANDINGS.map(([app, where, said]) => (
            <li
              key={app}
              className="grid gap-1 border-b border-[var(--rule)] py-5 sm:grid-cols-[180px_1fr] sm:gap-6"
            >
              <span className="text-[14px] text-[var(--faint)]">
                <span className="font-semibold text-[var(--dim)]">{app}</span> ·{" "}
                {where}
              </span>
              <span className="text-[19px] leading-[1.45] sm:text-[21px]">
                {said}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-[var(--faint)]">
          Sample dictation.
        </p>
      </section>

      <section className={`${WRAP} mt-32 grid gap-12 lg:grid-cols-[1fr_1.1fr]`}>
        <div className="flex flex-col gap-5">
          <h2 className="max-w-[14ch] text-[34px] sm:text-[44px]">
            Say what should happen next.
          </h2>
          <p className="max-w-[46ch] text-[17px] leading-[1.6] text-[var(--dim)]">
            Open issues, comment, review and merge pull requests, or hand a task
            to an agent, out loud. Merging, closing and starting agents always
            wait for your spoken yes; text the voice reads in an issue or on the
            board can&apos;t trigger them.
          </p>
        </div>
        <div>
          <dl className="flex flex-col">
            {ACTIONS.map(([said, done]) => (
              <div
                key={said}
                className="grid gap-1 border-b border-[var(--rule)] py-4 first:border-t"
              >
                <dt className="text-[18px]">&ldquo;{said}&rdquo;</dt>
                <dd className="text-[15px] text-[var(--faint)]">{done}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12.5px] text-[var(--faint)]">
            Sample replies.
          </p>
        </div>
      </section>

      <section className="band mt-32 py-20 sm:py-28">
        <div className={WRAP}>
          <h2 className="max-w-[18ch] text-[34px] sm:text-[44px]">
            Private where it counts.
          </h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-3">
            {[
              [
                "Approvals stay on your Mac.",
                "Agents reach the app over a local relay on 127.0.0.1, behind a private token. No server sits between your agent and your answer.",
              ],
              [
                "The mic is live only while you hold the key.",
                "Audio streams to ElevenLabs for transcription and voice while the key is down, and stops when you let go.",
              ],
              [
                "GitHub happens as you.",
                "Issues, reviews and merges go out from your own account after you sign in, with your own permissions.",
              ],
            ].map(([t, d]) => (
              <div
                key={t}
                className="flex flex-col gap-2 border-t border-[var(--rule)] pt-5"
              >
                <dt className="text-[18px] font-semibold">{t}</dt>
                <dd className="text-[15.5px] leading-[1.6] text-[var(--dim)]">
                  {d}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

            <section className="mt-36">
        <div className={`${WRAP} flex flex-col items-start gap-6`}>
          <h2 className="max-w-[20ch] text-[40px] sm:text-[56px]">
            Your agents are waiting on someone. Make it a quick conversation.
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <DownloadButton />
            <DownloadNote />
          </div>
        </div>
      </section>
    </main>
  );
}
