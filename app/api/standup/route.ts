import { resolveToken } from "@/lib/auth";
import { GhError } from "@/lib/github";
import { boardPosts } from "@/lib/board-read";
import { ElevenError, TTS_MODEL, elevenAudio } from "@/lib/eleven";
import { rateLimit } from "@/lib/ratelimit";
import { assertReadable } from "@/lib/repo-access";
import { parseRepo } from "@/lib/repo";
import { type Line, HOST, standupScript } from "@/lib/standup";
import { COWORKER_VOICE, assignVoices } from "@/lib/voices";

export const maxDuration = 60;

const fail = (status: number, error: string) => Response.json({ error }, { status });

// GET ?repo=owner/name&hours=3[&board=4][&format=json][&mode=stitched]
// -> audio/mpeg of a multi-voice standup. Headers: X-Standup-Mode (dialogue | stitched) and
// X-Standup-Script (base64 of the JSON lines [{speaker, voice, text}]). format=json returns the
// script only and spends no credits.
export async function GET(req: Request) {
  const limited = rateLimit(req, "standup");
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const parsed = parseRepo(q.get("repo"));
  if (!parsed.ok) return fail(400, parsed.error);
  const hours = q.has("hours") ? Number(q.get("hours")) : 3;
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) return fail(400, "hours must be a whole number from 1 to 72.");
  const board = q.has("board") ? Number(q.get("board")) : undefined;
  if (board !== undefined && !(Number.isInteger(board) && board > 0)) return fail(400, "board must be an issue number.");

  const { token, session } = await resolveToken(req);

  try {
    await assertReadable(parsed.repo, { signedIn: !!session });
    const posts = await boardPosts(parsed.repo, token, board, hours);
    const script = standupScript(posts, hours);
    if (!script) return fail(404, `The board has been quiet for the last ${hours === 1 ? "hour" : `${hours} hours`}. Nothing to stand up on.`);

    const voices = assignVoices(script.filter((l) => !l.host).map((l) => l.speaker));
    const voiceOf = (l: Line) => (l.host ? COWORKER_VOICE : voices.get(l.speaker)!);
    const lines = script.map((l) => ({ speaker: l.speaker, voice: voiceOf(l).name, text: l.text }));
    console.log(`standup: ${script.length} lines, ${script.reduce((n, l) => n + l.text.length, 0)} chars, voices ${[...new Set(script.map((l) => `${l.speaker}=${voiceOf(l).name}(${voiceOf(l).id})`))].join(", ")}`);
    if (q.get("format") === "json") return Response.json({ lines, host: HOST });

    let mode = "dialogue";
    let audio: Buffer;
    let note = "";
    try {
      if (q.get("mode") === "stitched") throw new ElevenError("stitched mode requested", 0);
      audio = await elevenAudio("/v1/text-to-dialogue", { model_id: "eleven_v3", inputs: script.map((l) => ({ text: l.text, voice_id: voiceOf(l).id })) });
    } catch (e) {
      if (!(e instanceof ElevenError)) throw e;
      // Dialogue is unavailable (plan, quota, outage): stitch one TTS call per line.
      // One at a time, because the free tier allows two concurrent requests.
      mode = "stitched";
      note = e.message;
      const parts: Buffer[] = [];
      for (const l of script) parts.push(await elevenAudio(`/v1/text-to-speech/${voiceOf(l).id}`, { text: l.text, model_id: TTS_MODEL }));
      audio = Buffer.concat(parts);
    }

    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Standup-Mode": mode,
        ...(note ? { "X-Standup-Fallback": note.replace(/[^\x20-\x7e]/g, "").slice(0, 120) } : {}),
        "X-Standup-Script": Buffer.from(JSON.stringify(lines)).toString("base64"),
      },
    });
  } catch (e) {
    if (e instanceof GhError || e instanceof ElevenError) return fail(e.status, e.message);
    console.error("standup failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong building the standup.");
  }
}
