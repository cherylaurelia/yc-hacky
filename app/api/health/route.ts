// GET /api/health -> { ok: true } for the host's and uptime monitors' liveness checks. No secrets, no upstream calls.
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
