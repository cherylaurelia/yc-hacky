// Runs in the Terminal 1 page's own JS world, only when that page is framed by this extension's side panel.
// It gives the page the same bridge the Mac app gives it (see macos/Coworker/CoworkerPanel.swift):
//   page -> panel: window.webkit.messageHandlers.coworker.postMessage({ state })
//   panel -> page: window events `coworker-ptt` {down, cancelled} and `coworker-ptt-key` {key}
(() => {
  if (window.top === window) return;
  const parentOrigin = location.ancestorOrigins && location.ancestorOrigins[0];
  if (!parentOrigin || !parentOrigin.startsWith("chrome-extension://") || location.ancestorOrigins.length !== 1) return;

  if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.coworker)) {
    const coworker = {
      postMessage(m) {
        try {
          window.parent.postMessage({ coworker: "page", m: JSON.parse(JSON.stringify(m)) }, parentOrigin);
        } catch {
          /* not cloneable: drop it */
        }
      },
    };
    window.webkit = Object.assign(window.webkit || {}, { messageHandlers: { coworker } });
  }

  // GitHub's sign-in page refuses to load in a frame, so the page's own "Sign in with GitHub"
  // button asks the panel to sign in in a tab instead (the click never reaches the page).
  window.addEventListener("click", (e) => {
    const b = e.target instanceof Element && e.target.closest("button, a");
    if (!b || !/^\s*sign in with github\s*$/i.test(b.textContent || "")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.parent.postMessage({ coworker: "sign-in" }, parentOrigin);
  }, true);

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || e.origin !== parentOrigin) return;
    const d = e.data || {};
    if (d.coworker === "ptt") {
      window.dispatchEvent(new CustomEvent("coworker-ptt", { detail: { down: d.down === true, cancelled: d.cancelled === true } }));
    } else if (d.coworker === "ptt-key" && typeof d.key === "string") {
      window.dispatchEvent(new CustomEvent("coworker-ptt-key", { detail: { key: d.key.slice(0, 24) } }));
    }
  });
})();
