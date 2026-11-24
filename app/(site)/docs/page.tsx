import type { Metadata } from "next";
import { Cmd, PreReleaseNote, TextLink } from "@/components/site/bits";

export const metadata: Metadata = { title: "Docs", description: "How to use Terminal 1: dictation, connecting agents, voice commands, the team board and troubleshooting." };

const SECTIONS = [
  ["start", "Getting started"],
  ["dictation", "Dictation"],
  ["agents", "Agents"],
  ["cli", "The coworker command"],
  ["voice", "What you can say"],
  ["board", "The team board"],
  ["privacy", "Privacy and data"],
  ["license", "License and billing"],
  ["troubleshooting", "Troubleshooting"],
] as const;

function H2({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-t border-[var(--rule)] pt-12 text-[30px] sm:text-[34px]">
      {children}
    </h2>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-4 max-w-[68ch] text-[16.5px] leading-[1.65] text-[var(--dim)]">{children}</p>;

const CLI: [cmd: string, does: string][] = [
  ['coworker ask "<question>" [--agent NAME] [--timeout S]', "Asks you out loud and prints your answer. Exit 2 when nobody answers in time."],
  ['coworker notify "<text>" [--kind done|blocked|stuck]', "Tells you something without waiting."],
  ["coworker install | uninstall claude | codex | cursor", "Wires Terminal 1 into that agent's hooks, or puts its settings back exactly as they were."],
  ['coworker run "<task>" [--agent claude|codex] [--repo owner/name]', "Starts an agent on a task in its own git worktree; it pushes a branch and opens a pull request. Only on repos you can push to."],
  ["coworker runs · coworker stop <id>", "Lists the runs you started, newest first, or stops one."],
  ["coworker doctor", "Says what is connected: the app's relay, GitHub, and each agent."],
];

const SAY: [say: string, does: string][] = [
  ["Allow · Deny · Stop it", "Answers the agent that just asked. Stop halts an agent stuck in a loop."],
  ["Show me", "Opens the exact command or diff the agent wants to run."],
  ["Tell Claude to use the staging database", "Relays your answer to the agent that asked."],
  ["What did the agents do since ten?", "A short digest from the team board."],
  ["Give me a standup", "Each agent reports its latest news in its own voice."],
  ["Open an issue: checkout breaks on Safari", "Opens it after you confirm the title."],
  ["Comment on 12: fixed in main · Close 7 · Label 7 bug", "Acts on issues and pull requests after a yes."],
  ["Approve 51 · Request changes on 51: add a test · Merge 51", "Reviews and merges. Merging always waits for your spoken yes."],
  ["Have Claude fix the flaky invoice test", "Puts the task on the team board for a board worker, which opens a pull request."],
];

export default function Docs() {
  return (
    <main className="mx-auto grid max-w-[1180px] gap-12 px-5 pt-14 sm:px-8 lg:grid-cols-[220px_1fr]">
      <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
        <p className="text-[13px] font-semibold text-[var(--faint)]">On this page</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[15px] lg:flex-col">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-[var(--dim)] no-underline hover:text-[var(--text)]">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 pb-10">
        <h1 className="text-[44px] sm:text-[56px]">Terminal 1 docs</h1>
        <PreReleaseNote>The Mac app isn&apos;t released yet; these docs describe how it will work. The web app works today.</PreReleaseNote>
        <P>Everything about using Terminal 1 day to day. For installing, start with the <TextLink href="/download">download guide</TextLink>.</P>

        <div className="mt-12 flex flex-col gap-4">
          <H2 id="start">Getting started</H2>
          <P>Terminal 1 sits in the menu bar. A small pill at the bottom of the screen shows what it&apos;s doing: idle, listening, thinking or speaking. Click the pill, or choose Show Panel from the menu, to open the full panel with your agents and the conversation.</P>
          <P>One key does two jobs. Hold it and talk to dictate into the app you&apos;re in. When an agent is waiting on you, or the panel is open, the same hold talks to your agents instead.</P>

          <H2 id="dictation">Dictation</H2>
          <P>Put your cursor where the text should go, hold the talk key, speak, and let go. The words are pasted at the cursor, and whatever was on your clipboard (text, images or files) is put back right after. If you copy something new in the meantime, your copy wins.</P>
          <P>Pick the language in Settings, or leave it on Auto. Dictation is part of Pro.</P>

          <H2 id="agents">Agents</H2>
          <P>Connected agents reach Terminal 1 through a relay that runs inside the app on your Mac. When one needs approval to run a command, the pill shows it, a notification arrives with Allow and Deny, and with Pro you hear it in that agent&apos;s own voice. Answer any of those ways; the agent continues within a second.</P>
          <P>If you don&apos;t answer, the agent falls back to its own prompt in its terminal, so nothing is ever stuck on Terminal 1. Cursor waits up to 20 seconds per shell command before letting its own rules decide; set COWORKER_TIMEOUT to change it.</P>

          <H2 id="cli">The coworker command</H2>
          <P>The app includes the <code>coworker</code> command for agents and scripts. Every command reads the relay&apos;s address from <code>~/.coworker/relay.json</code> and never prints its token.</P>
          <dl className="mt-6 flex flex-col gap-6">
            {CLI.map(([cmd, does]) => (
              <div key={cmd} className="flex flex-col gap-2">
                <dt>
                  <Cmd>{cmd}</Cmd>
                </dt>
                <dd className="text-[15.5px] text-[var(--dim)]">{does}</dd>
              </div>
            ))}
          </dl>

          <H2 id="voice">What you can say</H2>
          <P>With Pro, talk to the voice coworker in plain words. These are examples, not exact phrases.</P>
          <dl className="mt-6 border-t border-[var(--rule)]">
            {SAY.map(([say, does]) => (
              <div key={say} className="grid gap-1 border-b border-[var(--rule)] py-4 md:grid-cols-[1fr_1fr] md:gap-8">
                <dt className="text-[17px]">&ldquo;{say}&rdquo;</dt>
                <dd className="text-[15.5px] text-[var(--dim)]">{does}</dd>
              </div>
            ))}
          </dl>

          <H2 id="board">The team board</H2>
          <P>For a team, agents can also post to one pinned GitHub issue, the board. Teammates&apos; agents show up there with their own names and voices, and a board worker can turn a posted task into a pull request. Sign in to the web app with GitHub to read and answer the board; writes go out as your own account.</P>

          <H2 id="privacy">Privacy and data</H2>
          <P>The microphone is live only while you hold the talk key; that audio streams to ElevenLabs for transcription and the voice reply. Approvals between your agents and the app go through the relay on your Mac. Your license key is checked with Lemon Squeezy. The full details are in the <TextLink href="/privacy">privacy policy</TextLink>.</P>

          <H2 id="license">License and billing</H2>
          <P>After checkout, paste the license key into Settings &gt; License and click Activate. The app rechecks it now and then and keeps working offline for up to seven days. To move to a new Mac, click Deactivate on the old one first. Billing questions are answered on the <TextLink href="/pricing">pricing page</TextLink>.</P>

          <H2 id="troubleshooting">Troubleshooting</H2>
          <dl className="mt-6 border-t border-[var(--rule)]">
            {[
              ["The talk key does nothing in other apps.", "Turn Terminal 1 on in System Settings > Privacy & Security > Input Monitoring and Accessibility, then quit and reopen it."],
              ["Dictated text doesn't appear.", "Accessibility permission is missing; without it macOS drops the paste. The text stays on your clipboard, so you can paste it yourself."],
              ["My agent never asks.", "Run coworker doctor. It should say the relay is ok and the agent is installed. Restart the agent after installing so it loads the hooks."],
              ["macOS won't open the app.", "Right-click Terminal 1 in Applications, choose Open, then Open again."],
              ["Voice or dictation says Pro is needed.", "Check Settings > License. An expired or deactivated key drops the app back to Free."],
            ].map(([q, a]) => (
              <div key={q} className="border-b border-[var(--rule)] py-4">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 max-w-[68ch] text-[15.5px] leading-[1.6] text-[var(--dim)]">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
    </main>
  );
}
