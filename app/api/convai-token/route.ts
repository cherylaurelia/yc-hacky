import agent from "@/agent.json";
import { rateLimit } from "@/lib/ratelimit";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const BASE = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";

// GET -> { conversationToken } for a voice session (WebRTC).
// GET ?text=1 -> { signedUrl } for a text-only session (websocket).
// The agent id and the API key stay on the server, and the agent can be locked to sessions
// minted here (platform_settings.auth.enable_auth in scripts/sync-agent.ts).
export async function GET(req: Request) {
  const limited = rateLimit(req, "convai");
  if (limited) return limited;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !agent.agent_id) return fail(503, "The voice agent is not set up on the server.");

  const text = new URL(req.url).searchParams.get("text") === "1";
  const path = text ? "get-signed-url" : "token";
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/convai/conversation/${path}?${new URLSearchParams({ agent_id: agent.agent_id })}`, {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return fail(504, timeout ? "ElevenLabs took too long to answer." : "I could not reach ElevenLabs.");
  }
  if (!res.ok) {
    console.error(`convai-token: ElevenLabs returned ${res.status}`);
    return res.status === 429 ? fail(429, "ElevenLabs is busy. Try again in a minute.") : fail(502, `ElevenLabs refused to start a session (${res.status}).`);
  }
  const j = (await res.json().catch(() => ({}))) as { token?: string; signed_url?: string };
  const value = text ? j.signed_url : j.token;
  if (!value) return fail(502, "ElevenLabs sent back no session.");
  return Response.json(text ? { signedUrl: value } : { conversationToken: value }, { headers: { "Cache-Control": "no-store" } });
}
