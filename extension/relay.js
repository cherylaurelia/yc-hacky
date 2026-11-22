// Content script (isolated world) on the Coworker app's pages. When a page is framed by THIS
// extension, it runs /api/* calls for the extension from the page's origin, so the app's
// same-origin check and the sign-in cookie apply exactly as they do for the Coworker page.
(() => {
  if (window.top === window) return;
  const ours = `chrome-extension://${chrome.runtime.id}`;
  const anc = location.ancestorOrigins;
  if (!anc || anc.length !== 1 || anc[0] !== ours) return;

  window.addEventListener("message", async (e) => {
    if (e.source !== window.parent || e.origin !== ours) return;
    const d = e.data || {};
    if (d.coworker !== "api" || typeof d.path !== "string" || !d.path.startsWith("/api/")) return;
    const reply = (r) => window.parent.postMessage({ coworker: "api-reply", id: d.id, ...r }, ours);
    try {
      const res = await fetch(d.path, {
        method: d.method === "POST" ? "POST" : "GET",
        headers: d.body ? { "Content-Type": "application/json" } : undefined,
        body: d.body ? JSON.stringify(d.body) : undefined,
        credentials: "same-origin",
        cache: "no-store",
      });
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      reply({ ok: res.ok, status: res.status, json });
    } catch {
      reply({ ok: false, status: 0, json: { error: "Coworker isn't answering." } });
    }
  });
  window.parent.postMessage({ coworker: "relay-ready" }, ours);
})();
