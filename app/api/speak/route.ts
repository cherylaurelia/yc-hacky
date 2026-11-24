import { readJson } from "@/lib/body";
import { ElevenError, TTS_MODEL, elevenAudio } from "@/lib/eleven";
import { licenseGate } from "@/lib/license";
import { rateLimit } from "@/lib/ratelimit";
import { voiceFor } from "@/lib/voices";

const MAX_CHARS = 500;
const fail = (status: number, error: string) => Response.json({ error }, { status });

// POST { text, poster } -> audio/mpeg in the poster's voice. Free-tier credits are scarce, so text is capped.
export async function POST(req: Request) {
  const limited = rateLimit(req, "speak");
  if (limited) return limited;
  const unlicensed = await licenseGate(req);
  if (unlicensed) return unlicensed;
  const read = await readJson(req, 4096);
  if (!read.ok) return read.res;
  const body = read.body as { text?: unknown; poster?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/[[\]]/g, "").trim() : "";
  const poster = typeof body?.poster === "string" ? body.poster.trim() : "";
  if (!text) return fail(400, "Send the text to speak.");
  if (text.length > MAX_CHARS) return fail(413, `Keep it under ${MAX_CHARS} characters.`);
  if (!poster || poster.length > 60) return fail(400, "Send the poster, like [Aidan's Claude].");

  const voice = voiceFor(poster);
  try {
    const audio = await elevenAudio(`/v1/text-to-speech/${voice.id}`, { text, model_id: TTS_MODEL });
    console.log(`speak: ${poster} -> ${voice.name} (${voice.id}), ${text.length} chars`);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voice-Id": voice.id, "X-Voice-Name": voice.name },
    });
  } catch (e) {
    if (e instanceof ElevenError) return fail(e.status, e.message);
    console.error("speak failed:", e instanceof Error ? e.message : "unknown error");
    return fail(500, "Something went wrong speaking that.");
  }
}
