"use strict";
// The side panel can't show Chrome's mic prompt, so the grant happens here, on the extension's own
// origin. The panel's Coworker frame inherits it through allow="microphone".
const state = document.getElementById("micState");

function show(s) {
  state.textContent = s === "granted" ? "Microphone allowed." : s === "denied" ? "Blocked. Allow it from the icon at the left of the address bar." : "";
  state.className = s === "granted" ? "ok" : "hint";
}

navigator.permissions.query({ name: "microphone" }).then((p) => {
  show(p.state);
  p.onchange = () => show(p.state);
}).catch(() => {});

document.getElementById("grant").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    show("granted");
  } catch {
    show("denied");
  }
});

chrome.commands.getAll().then((cs) => {
  const c = cs.find((x) => x.name === "toggle-talk");
  if (c && c.shortcut) document.getElementById("shortcut").textContent = c.shortcut;
}).catch(() => {});
