// A single-use ElevenLabs token for realtime Scribe, so the Mac app dictates without ever holding the API key.
// Docs: https://elevenlabs.io/docs/api-reference/tokens/create (token lives 15 minutes, one session).
export function scribeTokenRequest(apiKey: string, base = "https://api.elevenlabs.io"): { url: string; init: RequestInit } {
  return {
    url: `${base}/v1/single-use-token/realtime_scribe`,
    init: { method: "POST", headers: { "xi-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  };
}
