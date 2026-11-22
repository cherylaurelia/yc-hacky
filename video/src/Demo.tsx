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

type Scene = { audio: string; audioSeconds: number; captions: string[]; Visual: () => ReactNode; hold?: number };

const SCENES: Scene[] = [
  {
    audio: "narration/narr-01.mp3",
    audioSeconds: 8.684,
    captions: ["You run five coding agents.", "One has been stuck in a loop for twenty minutes, burning money.", "Another has been waiting for your OK since lunch.", "You'd never know."],
    Visual: Hook,
  },
  {
    audio: "narration/narr-02.mp3",
    audioSeconds: 6.037,
    captions: ["This is Coworker.", "It watches all your agents, and when one needs you,", "it taps you on the shoulder.", "Out loud."],
    Visual: Intro,
  },
  {
    audio: "narration/narr-03.mp3",
    audioSeconds: 11.006,
    captions: ["Eithan's agent wants to run a database migration.", "I don't switch windows.", "I hold a key and say: show me.", "There's the exact change.", "Yes, allow it.", "And the agent keeps going."],
    Visual: Approval,
  },
  {
    audio: "narration/narr-04.mp3",
    audioSeconds: 10.867,
    captions: ["This one's worse.", "Aidan's agent keeps retrying the same failing test.", "Nothing errors in a retry loop, so no tool warns you.", "Coworker does.", "Stop it.", "Done."],
    Visual: Stuck,
  },
  {
    audio: "narration/narr-05.mp3",
    audioSeconds: 13.793,
    captions: ["Every agent speaks in its own voice,", "and it works across the whole team.", "Today my teammate's agent handed work to mine through the board,", "and a task posted there became a pull request in thirty-four seconds."],
    Visual: Team,
  },
  {
    audio: "narration/narr-06.mp3",
    audioSeconds: 13.793,
    captions: ["ElevenLabs is the whole interface.", "Their agent hears me and acts,", "and every agent gets its own voice.", "Coworker runs on Maritime,", "every decision is traced in TraceRoot,", "and we built it with agents running in Codevisor."],
    Visual: Partners,
  },
  {
    audio: "narration/narr-07.mp3",
    audioSeconds: 7.616,
    captions: ["One command to install.", "Your agents shouldn't need babysitting.", "They should tap you on the shoulder.", "This is Coworker."],
    Visual: Close,
    hold: HOLD,
  },
];

// ---- timing ---------------------------------------------------------------------------------------
const f = (s: number) => Math.round(s * FPS);
const lengths = SCENES.map((s) => f(LEAD + s.audioSeconds + PAD + (s.hold ?? 0)));
const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
export const DEMO_FRAMES = lengths.reduce((a, b) => a + b, 0);

const BG = "radial-gradient(120% 90% at 50% 20%, #efe8dc 0%, #e6dccd 100%)";
const STOP = "#a3382a";
const BAND_TOP = FRAME_TOP + FRAME_H;

export const CoworkerDemo = () => (
  <AbsoluteFill style={{ background: BG, fontFamily: sans }}>
    {SCENES.map((s, i) => (
      <Sequence key={i} from={starts[i]} durationInFrames={lengths[i]} name={`scene ${i + 1}`}>
        <Faded>
          <s.Visual />
        </Faded>
        <Sequence from={f(LEAD)}>
          <Audio src={staticFile(s.audio)} />
        </Sequence>
        <Captions lines={s.captions} audioSeconds={s.audioSeconds} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

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
    <AbsoluteFill style={{ top: BAND_TOP, height: HEIGHT - BAND_TOP, alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ fontFamily: serif, fontSize: 54, lineHeight: 1.15, letterSpacing: "-0.01em", color: INK, textAlign: "center", maxWidth: 1560 }}>{span.text}</div>
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
    ["One stuck.", 1.9, STOP],
    ["One waiting.", 5.3, INK],
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
      <Shot file="screens/01-calm.png" camera={CALM} at={0} until={4.4} />
      <Shot file="screens/02-approval.png" camera={CARD_CAM} at={3.7} />
    </>
  );
}

// ---- 3. approval: card, then the diff, then the terminal that was allowed --------------------------
function Approval() {
  return (
    <>
      <Shot file="screens/02-approval.png" camera={CARD_CAM} at={0} until={6.5} />
      <Shot file="screens/03-diff.png" camera={DIFF_CAM} at={6.1} until={9.3} />
      <On at={8.9}>
        <Terminal
          title="Eithan's Claude  ·  demo-storefront"
          lines={APPROVED}
          mark={[/Allowed by PermissionRequest hook/, "#8fd19e"]}
          from={0.2}
        />
      </On>
    </>
  );
}

// ---- 4. stuck: red card, then the terminal that was stopped ----------------------------------------
function Stuck() {
  return (
    <>
      <Shot file="screens/04-stuck.png" camera={CARD_CAM} at={0} until={9.9} />
      <On at={9.4}>
        <Terminal title="Aidan's Claude  ·  demo-payments-api" lines={STOPPED} mark={[/hook stopped Claude/, "#f0907f"]} from={0.2} />
      </On>
    </>
  );
}

// Real lines from live Claude Code agents (the capture files are named in video/README.md). Verbatim, trimmed.
// The next line of the stuck capture is cropped on purpose.
const APPROVED = [
  "⏺ Update(db/schema.sql)",
  "  ⎿ \u00a0Added 2 lines, removed 1 line",
  "",
  "  Read 2 files, ran 1 shell command",
  "  ⎿ \u00a0Allowed by PermissionRequest hook",
  "",
  "⏺ created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP is now in the orders table in db/schema.sql. npm run migrate printed migrate: applied db/schema.sql (1 table, 4 columns), ok.",
];
const STOPPED = [
  "⏺ Run 5 failed. Re-running.",
  "",
  "  Ran 1 shell command · 1 failed",
  "",
  "⏺ Run 6 failed. Re-running.",
  "",
  "  Ran 1 shell command · 1 failed",
  "  ⎿ \u00a0PreToolUse:Bash hook stopped Claude",
];

const Terminal = ({ title, lines, mark, from }: { title: string; lines: string[]; mark: [RegExp, string]; from: number }) => {
  const t = useT();
  let n = 0;
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: FRAME_TOP, width: FRAME_W, height: FRAME_H, borderRadius: 26, overflow: "hidden", background: "#1d1915", boxShadow: "0 2px 4px rgba(60,40,20,0.15), 0 44px 80px -30px rgba(60,40,20,0.5)" }}>
        <div style={{ height: 70, display: "flex", alignItems: "center", gap: 12, padding: "0 28px", borderBottom: "1px solid #332d26" }}>
          {["#5b5348", "#5b5348", "#5b5348"].map((c, i) => (
            <span key={i} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
          ))}
          <span style={{ marginLeft: 18, fontFamily: sans, fontSize: 24, color: "#b9ae9d", letterSpacing: "0.01em" }}>{title}</span>
        </div>
        <div style={{ padding: "44px 64px", fontFamily: mono, fontSize: 31, lineHeight: 1.55, color: "#ece5d8", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontVariantLigatures: "none" }}>
          {lines.map((line, i) => {
            const at = from + 0.25 * n;
            if (line) n++;
            const hit = mark[0].test(line);
            return (
              <div key={i} style={{ minHeight: line ? undefined : 24, opacity: interpolate(t, [at, at + 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), color: hit ? mark[1] : /^\s/.test(line) ? "#b9ae9d" : "#ece5d8", fontWeight: hit ? 500 : 400 }}>
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- 5. team: every agent has a voice, work moves across the board ----------------------------------
// Names and voices are what the app assigns (lib/voices.ts). Post text is verbatim from issues #1 and #4.
const VOICES = [
  { who: "Eithan's Codex", voice: "Roger", color: "#3b6788" },
  { who: "Eithan's Claude", voice: "Alice", color: "#7d58ab" },
  { who: "Aidan's Claude", voice: "Jessica", color: "#2a7474" },
  { who: "Cheryl's Claude", voice: "Sarah", color: "#a84c73" },
];
type Post = { who: string; color: string; text: string; chip?: string };
const HANDOFF: Post[] = [
  { who: "Eithan's Codex", color: "#3b6788", text: "TASK for Cheryl's Claude: Add a waiting line for Coworker's spoken blocker alerts. If two agents need help at once, read the first question aloud and show the second as waiting…" },
  { who: "Cheryl's Claude", color: "#a84c73", text: "@EithanY-Coder on it: alert waiting line (one spoken alert at a time, quiet while the user talks or the answer is sending, answers bound to the right agent)…" },
];
const SPOKEN: Post[] = [
  { who: "Cheryl's Coworker", color: "#2a7474", text: "TASK for Cheryl's Claude: add a small footer that says \"Built at YC x ElevenLabs Hackathon\"" },
  { who: "Cheryl's Claude", color: "#a84c73", text: "on it: add a small footer that says \"Built at YC x ElevenLabs Hackathon\"" },
  { who: "Cheryl's Claude", color: "#a84c73", text: "done: [demo] feat(ui): add hackathon footer, PR #5", chip: "PR #5" },
];

function Team() {
  const t = useT();
  return (
    <>
      <Panel>
        <Sequence durationInFrames={f(8.8)}>
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
            <Posts posts={HANDOFF} at={[5.0, 7.2]} t={t} size={30} />
          </PanelPage>
        </Sequence>
        <Sequence from={f(8.8)}>
          <PanelPage title="A task, spoken to Coworker" sub="issue #4">
            <Posts posts={SPOKEN} at={[9.2, 10.6, 12.2]} t={t} size={40} />
          </PanelPage>
        </Sequence>
      </Panel>
    </>
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
          <div style={{ fontSize: size, lineHeight: 1.3, color: INK, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.text}</div>
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
  { name: "Maritime", note: "runs on", on: [6.9, 9.0] },
  { name: "TraceRoot", note: "every decision traced", on: [9.0, 11.6] },
  { name: "assistant-ui", note: "text chat", on: [99, 99] },
  { name: "Codevisor", note: "built with", on: [11.7, 99] },
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
  return <End shot={{ title: "Coworker", line: "Your agents tap you on the shoulder." }} />;
}
