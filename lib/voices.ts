// Board poster tag -> ElevenLabs premade voice. The same poster always gets the same voice.
export type Voice = { id: string; name: string };

// The live agent's own voice (agent_6301... tts.voice_id). Kept out of the poster pool.
export const COWORKER_VOICE: Voice = { id: "cjVigY5qzO86Huf0OWal", name: "Eric" };

// Voices the user may pick for Coworker itself, Eric first (the default). None is in POSTER_VOICES,
// so Coworker never sounds like an agent. Ids checked against GET /v1/voices.
export const COWORKER_VOICES: readonly Voice[] = [
  COWORKER_VOICE,
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily" },
];

// A stored or requested voice id, or undefined when it is not one Coworker offers.
export const coworkerVoice = (id: string | null | undefined): Voice | undefined => COWORKER_VOICES.find((v) => v.id === id);

// All six premade voices, checked against GET /v1/voices. Mixed gender and accent so they are easy to tell apart.
export const POSTER_VOICES: readonly Voice[] = [
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica" },
];

// "[Aidan's Claude]" and "aidan's  claude" are the same poster.
const normalize = (poster: string) =>
  poster.replace(/[[\]]/g, "").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

// FNV-1a: tiny and stable across runtimes. SALT was searched so the six likeliest tags (Aidan, Eithan and
// Cheryl, each with Claude and Codex) land on six different voices; any other tag still hashes the same way every time.
const SALT = "5:";
function hash(s: string): number {
  let h = 0x811c9dc5;
  s = SALT + s;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export const voiceFor = (poster: string): Voice => POSTER_VOICES[hash(normalize(poster)) % POSTER_VOICES.length];

// Voices for the speakers of one audio. A hash collision moves the alphabetically later
// poster to the next free voice, so no two agents in a standup sound alike (up to six).
export function assignVoices(posters: string[]): Map<string, Voice> {
  const out = new Map<string, Voice>();
  const taken = new Set<number>();
  for (const p of [...new Set(posters)].sort((a, b) => normalize(a).localeCompare(normalize(b)))) {
    let i = hash(normalize(p)) % POSTER_VOICES.length;
    for (let n = 0; taken.has(i) && n < POSTER_VOICES.length; n++) i = (i + 1) % POSTER_VOICES.length;
    taken.add(i);
    out.set(p, POSTER_VOICES[i]);
  }
  return out;
}
