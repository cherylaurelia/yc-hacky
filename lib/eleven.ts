import { createHash } from "node:crypto";

// Server-only ElevenLabs POST helper. The key never leaves the server, errors are short
// sentences safe to show a user, and finished audio is cached so a replay spends no credits.
export class ElevenError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const TTS_MODEL = "eleven_flash_v2_5";

const BASE = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";
const cache = new Map<string, Buffer>();
const CACHE_MAX = 40;

export async function elevenAudio(path: string, body: unknown): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new ElevenError("Voice is not set up on the server.", 500);

  const id = createHash("sha1").update(path).update(JSON.stringify(body)).digest("hex");
  const hit = cache.get(id);
  if (hit) return hit;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ElevenError(timeout ? "ElevenLabs took too long to answer." : "I could not reach ElevenLabs.", 504);
  }

  if (!res.ok) {
    const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => undefined);
    const d = (typeof detail === "object" && detail ? detail : {}) as { status?: string; message?: string };
    if (d.status === "quota_exceeded" || res.status === 429) throw new ElevenError("ElevenLabs credits or rate limit reached. Try again later.", 429);
    if (res.status === 401 || res.status === 403) throw new ElevenError(`ElevenLabs refused the request (${d.status ?? res.status}).`, 502);
    if (res.status === 422) throw new ElevenError("ElevenLabs could not read that text.", 422);
    throw new ElevenError(`ElevenLabs returned error ${res.status}.`, 502);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  if (!audio.length) throw new ElevenError("ElevenLabs sent back empty audio.", 502);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(id, audio);
  return audio;
}
