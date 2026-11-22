// GET /ext/relay -> an empty page on the app's own origin. The Chrome extension loads it in a hidden
// frame; the extension's content script (extension/relay.js) then calls /api/* from here, so the
// requests carry this origin and your sign-in cookie, the same as the Terminal 1 page.
export function GET() {
  return new Response('<!doctype html><meta charset="utf-8"><title>Terminal 1 relay</title>', {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
