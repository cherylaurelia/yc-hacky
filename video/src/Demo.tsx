import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CARD, End, FPS, FRAME_H, FRAME_TOP, FRAME_W, HEIGHT, INK, LINE, PAPER, SOFT, Screen, type Cam, mono, sans, serif } from "./Launch";

// ---------------------------------------------------------------------------------------------------
// The 2-minute demo: seven scenes, each as long as its narration plus a little air.
//   audio / audioSeconds  the ElevenLabs narration in public/narration/ and its length (ffprobe, see README)
//   captions              the narration text, cut into short lines; each line is on screen for a share of
//                         the audio proportional to its length
//   Visual                what is on screen (components below, timed in seconds from the scene start)
// Change audioSeconds when you swap a narration file, and the whole cut re-times itself.
// ---------------------------------------------------------------------------------------------------
const LEAD = 0.2; // the voice starts this long after the scene does
const PAD = 0.6; // air after the voice, before the next scene
const HOLD = 2.5; // the last card stays up this long after the last word

type Scene = { audio: string; audioSeconds: number; headline: string; captions: string[]; Visual: () => ReactNode; hold?: number };

const SCENES: Scene[] = [
  { audio: "narration/narr-01.mp3", audioSeconds: 5.759, headline: "The problem", captions: ["How many of your coding agents are waiting on you right now?", "You don't know.", "They sit silent in terminal tabs."], Visual: Hook },
  { audio: "narration/narr-02.mp3", audioSeconds: 11.238, headline: "It interrupts you, not the other way round", captions: ["This is Terminal 1.", "It watches all your agents, and speaks up when one needs approval, is blocked, or is stuck.", "A general assistant waits for you to ask.", "This one interrupts you."], Visual: Intro },
  { audio: "narration/narr-03.mp3", audioSeconds: 8.777, headline: "Answer by voice", captions: ["I say: show me.", "The exact change opens full screen, never read aloud.", "Then I say: allow,", "and Claude Code continues, with no keypress."], Visual: Approval },
  { audio: "narration/narr-04.mp3", audioSeconds: 8.452, headline: "It catches stuck retry loops", captions: ["It catches stuck retry loops no tool warns you about,", "with the retries, the minutes and the dollars.", "I say: stop it,", "and the agent halts."], Visual: Stuck },
  { audio: "narration/narr-05.mp3", audioSeconds: 7.012, headline: "A voice for every agent", captions: ["Every agent has its own ElevenLabs voice,", "so you know who is talking.", "Press standup, and you get one voice per agent."], Visual: Voices },
  { audio: "narration/narr-06.mp3", audioSeconds: 9.102, headline: "Voice to pull request", captions: ["Say a task, and a headless Claude Code agent builds it in its own worktree", "and opens a pull request.", "Thirty-four seconds, measured on a small change."], Visual: PullRequest },
  { audio: "narration/narr-07.mp3", audioSeconds: 6.316, headline: "It knows the whole repo", captions: ["It knows the whole repo.", "Ask what pull requests are open, whether CI is passing, or what changed today."], Visual: RepoCard },
  { audio: "narration/narr-08.mp3", audioSeconds: 2.554, headline: "One command", captions: ["One command connects any Claude Code session."], Visual: ConnectCard },
  { audio: "narration/narr-09.mp3", audioSeconds: 9.706, headline: "", captions: ["Terminal 1 is live now.", "Built on ElevenLabs Agents, text to speech and text to dialogue, with Claude Code.", "Your agents shouldn't need babysitting.", "They should tap you on the shoulder."], Visual: Close, hold: HOLD },
];

// ---- timing ---------------------------------------------------------------------------------------
const f = (s: number) => Math.round(s * FPS);
const lengths = SCENES.map((s) => f(LEAD + s.audioSeconds + PAD + (s.hold ?? 0)));
const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
export const DEMO_FRAMES = lengths.reduce((a, b) => a + b, 0);

const BG = "radial-gradient(120% 90% at 50% 20%, #efe8dc 0%, #e6dccd 100%)";
const STOP = "#a3382a";
const BAND_TOP = FRAME_TOP + FRAME_H;

export const Terminal1Demo = () => (
  <AbsoluteFill style={{ background: BG, fontFamily: sans }}>
    {SCENES.map((s, i) => (
      <Sequence key={i} from={starts[i]} durationInFrames={lengths[i]} name={`scene ${i + 1}`}>
        <Faded>
          <s.Visual />
        </Faded>
        <Sequence from={f(LEAD)}>
          <Audio src={staticFile(s.audio)} />
        </Sequence>
        {s.headline && <Headline text={s.headline} />}
        <Captions lines={s.captions} audioSeconds={s.audioSeconds} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

const Headline = ({ text }: { text: string }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [4, 14], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ top: BAND_TOP + 8, height: 34, alignItems: "center", opacity }}>
      <div style={{ fontFamily: mono, fontSize: 21, letterSpacing: "0.14em", textTransform: "uppercase", color: SOFT }}>{text}</div>
    </AbsoluteFill>
  );
};

// Every scene dips in and out so the cuts do not pop.
const Faded = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// One caption line at a time. A line owns a slice of the audio as long as its share of the characters.
const Captions = ({ lines, audioSeconds }: { lines: string[]; audioSeconds: number }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS - LEAD;
  const total = lines.reduce((n, l) => n + l.length, 0);
  let at = 0;
  const spans = lines.map((text) => {
    const from = (at / total) * audioSeconds;
    at += text.length;
    return { text, from, to: (at / total) * audioSeconds };
  });
  const span = spans.find((x) => t >= x.from - 0.05 && t < x.to - 0.05);
  if (!span) return null;
  const k = (t - span.from) * FPS;
  const opacity = interpolate(k, [0, 5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ top: BAND_TOP + 30, height: HEIGHT - BAND_TOP - 30, alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ fontFamily: serif, fontSize: 50, lineHeight: 1.15, letterSpacing: "-0.01em", color: INK, textAlign: "center", maxWidth: 1560 }}>{span.text}</div>
    </AbsoluteFill>
  );
};

const useT = () => useCurrentFrame() / FPS;
const rise = (t: number, at: number) => ({
  opacity: interpolate(t, [at, at + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  transform: `translateY(${interpolate(t, [at, at + 0.6], [22, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
});

// A real screenshot in the frame, from `at` seconds until the scene ends (or `until`).
const Shot = ({ file, camera, at, until }: { file: string; camera: [Cam, Cam]; at: number; until?: number }) => {
  const { durationInFrames } = useVideoConfig();
  const end = until === undefined ? durationInFrames : f(until);
  return (
    <Sequence from={f(at)} durationInFrames={end - f(at)}>
      <Screen shot={{ file, camera }} dur={end - f(at)} first={false} />
    </Sequence>
  );
};
const On = ({ at, children }: { at: number; children: ReactNode }) => (
  <Sequence from={f(at)}>
    <FadeIn>{children}</FadeIn>
  </Sequence>
);
const FadeIn = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }) }}>{children}</AbsoluteFill>;
};

const CALM: [Cam, Cam] = [[1, 50, 50], [1.25, 50, 54]];
const CARD_CAM: [Cam, Cam] = [[1.3, 50, 46], [1.5, 50, 46]];
const DIFF_CAM: [Cam, Cam] = [[1.3, 50, 46], [1.4, 50, 46]];

// ---- 1. hook: bold text over the calm screen --------------------------------------------------------
function Hook() {
  const t = useT();
  const lines: [string, number, string][] = [
    ["Five agents.", 0.3, INK],
    ["One stuck.", 2.0, STOP],
    ["One waiting.", 3.6, INK],
  ];
  return (
    <AbsoluteFill>
      <Img src={staticFile("screens/01-calm.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(12px)", transform: "scale(1.08)" }} />
      <AbsoluteFill style={{ background: "rgba(243,238,230,0.9)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 170 }}>
        {lines.map(([text, at, color]) => (
          <div key={text} style={{ ...rise(t, at), fontFamily: serif, fontSize: 176, lineHeight: 1.08, letterSpacing: "-0.02em", color }}>
            {text}
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---- 2. intro: calm screen, then the approval card rises -------------------------------------------
function Intro() {
  return (
    <>
      <Shot file="screens/01-calm.png" camera={CALM} at={0} until={7.4} />
      <Shot file="screens/02-approval.png" camera={CARD_CAM} at={6.7} />
    </>
  );
}

// ---- 3. approval: card, then the diff, then the diff --------------------------
function Approval() {
  return (
    <>
      <Shot file="screens/02-approval.png" camera={CARD_CAM} at={0} until={3.2} />
      <Shot file="screens/03-diff.png" camera={DIFF_CAM} at={2.8} />
    </>
  );
}

// ---- 4. stuck: red card, then stop it ----------------------------------------
function Stuck() {
  return (
    <>
      <Shot file="screens/04-stuck.png" camera={CARD_CAM} at={0} until={9.9} />
    </>
  );
}

// ---- 5. team: every agent has a voice, work moves across the board ----------------------------------
// Names and voices are what the app assigns (lib/voices.ts). Post text is verbatim from issues #1 and #4, no edits.
const VOICES = [
  { who: "Eithan's Codex", voice: "Roger", color: "#3b6788" },
  { who: "Eithan's Claude", voice: "Alice", color: "#7d58ab" },
  { who: "Aidan's Claude", voice: "Jessica", color: "#2a7474" },
  { who: "Cheryl's Claude", voice: "Sarah", color: "#a84c73" },
];
type Post = { who: string; color: string; text: string; chip?: string };
const HANDOFF: Post[] = [
  { who: "Cheryl's Claude", color: "#a84c73", text: "@EithanY-Coder on it: alert waiting line (one spoken alert at a time, quiet while the user talks or the answer is sending, answers bound to the right agent). Folding it into the UI work in progress; will post done with the commit." },
  { who: "Cheryl's Claude", color: "#a84c73", text: "@EithanY-Coder done: alert waiting line is on main (d162554). One spoken alert at a time, the next waits until the answer posts (or Skip / 90 s), answers are bound to the req of the alert being asked. Tested with two approvals seeded together: voice windows did not overlap, both replies went to the right req." },
];
const PICKED_UP: Post[] = [
  { who: "Cheryl's Claude", color: "#a84c73", text: "done: The footer is in: the main page now ends with a small grey line, \"Built at YC × ElevenLabs Hackathon\" in yc-hacky" },
  { who: "Cheryl's Claude", color: "#a84c73", text: "@EithanY-Coder done: Terminal 1 is silent when idle. ElevenLabs turn_timeout off (no 'are you still there'), sessions 1 h instead of 10 min, prompt asks about each alert once, spoken posts cut to first sentence. Live now on the ElevenLabs agent (no redeploy needed).", chip: "PRs #21 #22" },
];

function Voices() {
  const t = useT();
  return (
    <Panel>
      <PanelPage title="The board" sub="one GitHub issue, every agent posts here">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 30, ...rise(t, 0.3) }}>
          {VOICES.map((v) => (
            <span key={v.who} style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "#efe8dd", borderRadius: 999, padding: "10px 22px 10px 12px", fontSize: 25 }}>
              <Avatar who={v.who} color={v.color} size={36} />
              <b style={{ fontWeight: 600 }}>{v.who}</b>
              <span style={{ color: SOFT }}>{v.voice}</span>
            </span>
          ))}
        </div>
        <Posts posts={HANDOFF} at={[2.4, 4.4]} t={t} size={29} />
      </PanelPage>
    </Panel>
  );
}

function PullRequest() {
  const t = useT();
  return (
    <Panel>
      <PanelPage title="Task in, pull request out" sub="cherylaurelia/yc-hacky, issue #1">
        <Posts posts={PICKED_UP} at={[1.2, 4.2]} t={t} size={44} />
      </PanelPage>
    </Panel>
  );
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => {
  const t = useT();
  return (
    <Panel>
      <PanelPage title={title} sub="cherylaurelia/yc-hacky">
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 20 }}>{children && (Array.isArray(children) ? children : [children]).map((c, i) => <div key={i} style={rise(t, 0.4 + i * 0.9)}>{c}</div>)}</div>
      </PanelPage>
    </Panel>
  );
};
const Q = ({ q }: { q: string }) => (
  <div style={{ background: PAPER, borderRadius: 22, padding: "26px 36px", fontFamily: serif, fontSize: 58, color: INK }}>{q}</div>
);
// No recording of the repo tools exists, so this is a plain text card, not a fake of the app.
function RepoCard() {
  return (
    <Card title="Ask it about the repo">
      <Q q="“What pull requests are open?”" />
      <Q q="“Is CI passing?”" />
      <Q q="“What changed today?”" />
    </Card>
  );
}
function ConnectCard() {
  return (
    <Card title="Connect a session">
      <div style={{ background: "#1d1915", color: "#ece5d8", borderRadius: 22, padding: "36px 40px", fontFamily: mono, fontSize: 30, lineHeight: 1.5, wordBreak: "break-all" }}>
        gh api repos/cherylaurelia/yc-hacky/contents/hooks/install.sh -H &quot;Accept: application/vnd.github.raw&quot; | bash
      </div>
      <div style={{ fontSize: 34, color: SOFT }}>Installs the hooks. Every Claude Code session then posts approvals, blockers and stuck loops to the board.</div>
    </Card>
  );
}

const Avatar = ({ who, color, size }: { who: string; color: string; size: number }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: size * 0.45, flexShrink: 0 }}>{who.charAt(0)}</span>
);

const Posts = ({ posts, at, t, size }: { posts: Post[]; at: number[]; t: number; size: number }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
    {posts.map((p, i) => (
      <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start", background: PAPER, borderRadius: 22, padding: "22px 28px", ...rise(t, at[i]) }}>
        <Avatar who={p.who} color={p.color} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 25, color: SOFT }}>
            <b style={{ color: INK, fontWeight: 600 }}>[{p.who}]</b>
            {p.chip && <span style={{ background: INK, color: CARD, borderRadius: 999, padding: "2px 16px", fontSize: 22, fontWeight: 500 }}>{p.chip}</span>}
          </div>
          <div style={{ fontSize: size, lineHeight: 1.3, color: INK, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.text}</div>
        </div>
      </div>
    ))}
  </div>
);

// A paper card the size of the screenshots' frame, for things that are not screenshots.
const Panel = ({ children }: { children: ReactNode }) => (
  <AbsoluteFill style={{ alignItems: "center" }}>
    <div style={{ position: "absolute", top: FRAME_TOP, width: FRAME_W, height: FRAME_H, borderRadius: 26, overflow: "hidden", background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 2px 4px rgba(60,40,20,0.08), 0 44px 80px -30px rgba(60,40,20,0.38)" }}>{children}</div>
  </AbsoluteFill>
);
const PanelPage = ({ title, sub, children }: { title: string; sub: string; children: ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: "52px 64px", opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 30 }}>
        <span style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.01em", color: INK }}>{title}</span>
        <span style={{ fontFamily: mono, fontSize: 24, color: SOFT }}>{sub}</span>
      </div>
      {children}
    </AbsoluteFill>
  );
};

// ---- 6. partners: a plain wordmark row over the app ------------------------------------------------
const PARTNERS: { name: string; note: string; on: [number, number] }[] = [
  { name: "ElevenLabs", note: "the whole interface", on: [0.3, 6.5] },
  { name: "Maritime", note: "runs on", on: [6.6, 8.3] },
  { name: "TraceRoot", note: "every decision traced", on: [8.3, 10.5] },
  { name: "assistant-ui", note: "text chat", on: [99, 99] },
  { name: "Codevisor", note: "built with", on: [10.8, 99] },
];
function Partners() {
  const t = useT();
  return (
    <AbsoluteFill>
      <Img src={staticFile("screens/02-approval.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(12px)", transform: "scale(1.08)" }} />
      <AbsoluteFill style={{ background: "rgba(243,238,230,0.92)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 140 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 52 }}>
          {PARTNERS.map((p, i) => {
            const base = 0.38;
            const k = p.on[0] > 90 ? 0 : interpolate(t, [p.on[0], p.on[0] + 0.4, p.on[1] - 0.2, p.on[1]], [0, 1, 1, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={p.name} style={{ ...rise(t, 0.2 + i * 0.15), textAlign: "center" }}>
                <div style={{ fontFamily: serif, fontSize: 62, letterSpacing: "-0.01em", color: INK, opacity: base + (1 - base) * k }}>{p.name}</div>
                <div style={{ marginTop: 8, fontSize: 26, color: SOFT, opacity: k }}>{p.note}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---- 7. close ---------------------------------------------------------------------------------------
function Close() {
  return <End shot={{ title: "Terminal 1", line: "Your agents tap you on the shoulder." }} />;
}
