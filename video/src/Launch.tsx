import { loadFont as loadSans } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/Newsreader";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// ---------------------------------------------------------------------------------------------------
// The whole edit lives here. Order, timing, captions and camera moves for every shot.
//   seconds  how long the shot is on screen
//   caption  one short line under the screen (plain words, under 8)
//   camera   [scale, x, y] at the start and at the end of the shot: a slow push in. x and y are the point
//            of the screenshot (in percent) kept at the middle of the frame. At scale 1.3 and up the header
//            and the mic pill fall outside the frame, so only the card shows.
// Screens are real screenshots from the app, see video/README.md for how to retake them.
// ---------------------------------------------------------------------------------------------------
export type Cam = [scale: number, x: number, y: number];
export type ScreenShot = { kind: "screen"; file: string; seconds: number; caption: string; camera: [Cam, Cam] };
export type EndCard = { kind: "end"; seconds: number; title: string; line: string; url: string };
export type Shot = ScreenShot | EndCard;

export const SHOTS: Shot[] = [
  { kind: "screen", file: "screens/01-calm.png", seconds: 4, caption: "You run several coding agents.", camera: [[1, 50, 50], [1.35, 50, 58]] },
  { kind: "screen", file: "screens/02-approval.png", seconds: 4.5, caption: "One needs your OK.", camera: [[1.3, 50, 46], [1.55, 50, 46]] },
  { kind: "screen", file: "screens/03-diff.png", seconds: 5, caption: "Ask to see what it changed.", camera: [[1.3, 50, 46], [1.4, 50, 46]] },
  { kind: "screen", file: "screens/04-stuck.png", seconds: 4.5, caption: "Another is stuck in a loop.", camera: [[1.3, 50, 46], [1.55, 50, 46]] },
  { kind: "end", seconds: 4.5, title: "Coworker", line: "A voice coworker for your coding agents.", url: "github.com/cherylaurelia/yc-hacky" },
];

// ---- look: the app's own tokens (app/globals.css) -------------------------------------------------
export const PAPER = "#f3eee6";
export const CARD = "#fbf8f3";
export const INK = "#221d17";
export const SOFT = "#5f564b";
export const LINE = "#ddd3c5";

export const serif = loadSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const sans = loadSans("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;

// ---- timing ---------------------------------------------------------------------------------------
export const FADE = 14; // frames a screen takes to cross-fade over the one before it
const frames = (s: number) => Math.round(s * FPS);
const starts = SHOTS.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + frames(SHOTS[i - 1].seconds)], []);
export const TOTAL_FRAMES = SHOTS.reduce((n, s) => n + frames(s.seconds), 0);

// The screen sits in a rounded frame sized to the screenshots' 2100 x 1350 shape.
export const FRAME_H = 850;
export const FRAME_W = Math.round((FRAME_H * 2100) / 1350);
export const FRAME_TOP = 44;

export const Launch = () => (
  <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 20%, #efe8dc 0%, #e6dccd 100%)`, fontFamily: sans }}>
    {SHOTS.map((shot, i) => {
      const dur = frames(shot.seconds);
      if (shot.kind === "end") {
        return (
          <Sequence key={i} from={starts[i]} durationInFrames={dur} name="end card">
            <End shot={shot} />
          </Sequence>
        );
      }
      // The screen stays up FADE frames past its slot so the next one can fade in over it.
      const tail = i < SHOTS.length - 1 ? FADE : 0;
      return (
        <Sequence key={i} from={starts[i]} durationInFrames={dur + tail} name={shot.file}>
          <Screen shot={shot} dur={dur + tail} first={i === 0} />
        </Sequence>
      );
    })}
    {SHOTS.map((shot, i) =>
      shot.kind === "screen" ? (
        <Sequence key={`c${i}`} from={starts[i]} durationInFrames={frames(shot.seconds)} name={`caption ${i + 1}`}>
          <Caption text={shot.caption} dur={frames(shot.seconds)} />
        </Sequence>
      ) : null,
    )}
  </AbsoluteFill>
);

export const Screen = ({ shot, dur, first }: { shot: Pick<ScreenShot, "file" | "camera">; dur: number; first: boolean }) => {
  const f = useCurrentFrame();
  const fade = first ? 12 : FADE;
  const opacity = interpolate(f, [0, fade], [0, 1], { extrapolateRight: "clamp" });
  const at = (i: number) => interpolate(f, [0, dur], [shot.camera[0][i], shot.camera[1][i]], { easing: Easing.inOut(Easing.quad), extrapolateRight: "clamp" });
  const [scale, x, y] = [at(0), at(1), at(2)];
  return (
    <AbsoluteFill style={{ opacity, alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: FRAME_TOP,
          width: FRAME_W,
          height: FRAME_H,
          borderRadius: 26,
          overflow: "hidden",
          background: PAPER,
          border: `1px solid ${LINE}`,
          boxShadow: "0 2px 4px rgba(60,40,20,0.08), 0 44px 80px -30px rgba(60,40,20,0.38)",
        }}
      >
        <Img
          src={staticFile(shot.file)}
          style={{ width: "100%", height: "100%", transform: `scale(${scale}) translate(${50 - x}%, ${50 - y}%)` }}
        />
      </div>
    </AbsoluteFill>
  );
};

// Fades in a beat after its screen lands and out just before the next one, so two captions never overlap.
const Caption = ({ text, dur }: { text: string; dur: number }) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [8, 20, dur - 10, dur - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lift = interpolate(f, [8, 22], [14, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ top: FRAME_TOP + FRAME_H, height: HEIGHT - FRAME_TOP - FRAME_H, alignItems: "center", justifyContent: "center", opacity, transform: `translateY(${lift}px)` }}>
      <div style={{ fontFamily: serif, fontSize: 64, lineHeight: 1.1, letterSpacing: "-0.01em", color: INK, textAlign: "center" }}>{text}</div>
    </AbsoluteFill>
  );
};

// The pill from the app, with its voice bars, carrying the link.
const BARS = [0.25, 0.4, 0.6, 0.35, 0.8, 0.5, 0.3, 0.65, 0.45, 0.25];

export const End = ({ shot }: { shot: Pick<EndCard, "title" | "line" | "url"> }) => {
  const f = useCurrentFrame();
  const rise = (start: number) => ({
    opacity: interpolate(f, [start, start + 16], [0, 1], { extrapolateRight: "clamp" }),
    transform: `translateY(${interpolate(f, [start, start + 22], [18, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: "clamp" })}px)`,
  });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 0%, #f7f2ea 0%, ${PAPER} 60%)`, alignItems: "center", justifyContent: "center", opacity: interpolate(f, [0, FADE], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ ...rise(6), fontFamily: serif, fontSize: 230, lineHeight: 1, letterSpacing: "-0.02em", color: INK }}>{shot.title}</div>
      <div style={{ ...rise(16), marginTop: 26, fontSize: 44, color: SOFT }}>{shot.line}</div>
      <div
        style={{
          ...rise(28),
          marginTop: 64,
          display: "flex",
          alignItems: "center",
          gap: 22,
          background: INK,
          color: CARD,
          borderRadius: 999,
          padding: "0 46px 0 40px",
          height: 104,
          boxShadow: "0 22px 44px -22px rgba(34,29,23,0.7)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, height: 40 }}>
          {BARS.map((h, i) => (
            <span key={i} style={{ width: 6, height: "100%", borderRadius: 3, background: CARD, transform: `scaleY(${h * (0.9 + 0.1 * Math.sin(f / 5 + i))})` }} />
          ))}
        </span>
        <span style={{ fontFamily: mono, fontWeight: 500, fontSize: 44, letterSpacing: "0.01em" }}>{shot.url}</span>
      </div>
    </AbsoluteFill>
  );
};
