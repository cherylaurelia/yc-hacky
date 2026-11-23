import { sameOrigin, sessionFrom } from "@/lib/auth";
import { licenseGate } from "@/lib/license";
import { rateLimit } from "@/lib/ratelimit";
import { scribeTokenRequest } from "@/lib/scribe-token";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

// POST -> { token } for one dictation session. Signed-in users only: dictation spends the server's ElevenLabs credits.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Dictation tokens are only handed to the Coworker page.");
  const session = await sessionFrom(req);
  if (!session) return fail(401, "Sign in with GitHub to dictate.");
  const limited = rateLimit(req, "scribe", session.login);  // per user, so one account can't spend everyone's credits from many IPs
  if (limited) return limited;
  const unlicensed = await licenseGate(req);
  if (unlicensed) return unlicensed;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return fail(503, "Dictation is not set up on the server.");

  const { url, init } = scribeTokenRequest(key, process.env.ELEVENLABS_API_BASE || undefined);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return fail(504, timeout ? "ElevenLabs took too long to answer." : "I could not reach ElevenLabs.");
  }
  if (!res.ok) {
    console.error(`scribe-token: ElevenLabs returned ${res.status}`);
    return fail(res.status === 429 ? 429 : 502, res.status === 429 ? "ElevenLabs is busy. Try again in a minute." : `ElevenLabs refused a dictation token (${res.status}).`);
  }
  const { token } = (await res.json().catch(() => ({}))) as { token?: string };
  return token ? Response.json({ token }, { headers: { "Cache-Control": "no-store" } }) : fail(502, "ElevenLabs sent back no token.");
}
