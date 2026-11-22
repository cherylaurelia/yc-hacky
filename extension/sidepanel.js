// Side panel: the Coworker web page in a frame, plus the bits a browser tab can't do on its own
// (talk shortcut, sign-in in a tab, one-time mic grant, voice state on the toolbar icon).
"use strict";

const $ = (id) => document.getElementById(id);
const frame = $("app");
let settings;
let talking = false;
let signInTab = null;

const STATE_TEXT = { idle: "Ready", listening: "Listening", speaking: "Speaking", connecting: "Connecting" };

function showState(state) {
  $("dot").className = `dot ${state || ""}`;
  $("stateText").textContent = STATE_TEXT[state] || "Coworker";
  if (state !== "listening") talking = false;
  chrome.runtime.sendMessage({ type: "state", state }).catch(() => {});
}

function send(msg) {
  if (frame.contentWindow) frame.contentWindow.postMessage(msg, appOrigin(settings));
}

function talk(down) {
  talking = down;
  send({ coworker: "ptt", down });
}

async function reachable() {
  try {
    const res = await fetch(`${appOrigin(settings)}/api/me`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function load() {
  settings = await getSettings();
  $("repoText").textContent = settings.repo;
  $("offlineUrl").textContent = settings.appUrl;
  if (!(await reachable())) {
    frame.hidden = true;
    frame.src = "about:blank"; // unload the old page so it can't report a state
    $("offline").hidden = false;
    showState("off");
    $("stateText").textContent = "Not running";
    return;
  }
  $("offline").hidden = true;
  frame.hidden = false;
  frame.src = pageUrl(settings);
  showState("");
}

async function checkMic() {
  try {
    const p = await navigator.permissions.query({ name: "microphone" });
    $("micBanner").hidden = p.state === "granted";
    p.onchange = () => { $("micBanner").hidden = p.state === "granted"; };
  } catch {
    $("micBanner").hidden = true;
  }
}

// Page -> panel (through extension/bridge.js)
window.addEventListener("message", (e) => {
  if (!settings || e.source !== frame.contentWindow || e.origin !== appOrigin(settings)) return;
  const d = e.data || {};
  if (d.coworker === "page" && d.m && typeof d.m.state === "string") showState(d.m.state);
  if (d.coworker === "sign-in") signIn();
});

// The talk shortcut arrives from background.js over this port. The port also tells
// background.js the panel is open, so the shortcut talks instead of opening the panel.
function connect() {
  const port = chrome.runtime.connect({ name: "panel" });
  port.onMessage.addListener((msg) => { if (msg && msg.type === "toggle-talk") talk(!talking); });
  port.onDisconnect.addListener(() => setTimeout(connect, 500)); // the service worker restarted
}
connect();

async function pendingTalk() {
  try {
    const { talkNow } = await chrome.storage.session.get("talkNow");
    if (!talkNow) return;
    await chrome.storage.session.remove("talkNow");
    // Give the page a moment to start before pressing talk.
    setTimeout(() => talk(true), 1500);
  } catch { /* storage unavailable */ }
}
chrome.storage.session.onChanged.addListener((c) => { if (c.talkNow && c.talkNow.newValue) pendingTalk(); });

// GitHub's sign-in page refuses to load in a frame, so sign in happens in a tab that closes itself.
async function signIn() {
  const u = new URL(pageUrl(settings));
  const to = `${u.origin}/api/auth/login?next=${encodeURIComponent(u.pathname + u.search)}`;
  signInTab = (await chrome.tabs.create({ url: to })).id;
}
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (id !== signInTab || change.status !== "complete" || !tab.url) return;
  if (tab.url.startsWith(appOrigin(settings)) && !tab.url.includes("/api/auth/")) {
    signInTab = null;
    chrome.tabs.remove(id).catch(() => {});
    load();
  }
});

$("openTab").addEventListener("click", () => chrome.tabs.create({ url: pageUrl(settings) }));
$("reload").addEventListener("click", load);
$("retry").addEventListener("click", load);
const openWelcome = () => chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
$("micFix").addEventListener("click", openWelcome);
$("micSetup").addEventListener("click", openWelcome);

$("gear").addEventListener("click", () => {
  const open = $("settings").hidden;
  $("settings").hidden = !open;
  $("gear").setAttribute("aria-pressed", String(open));
  if (open) {
    $("appUrl").value = settings.appUrl;
    $("repo").value = settings.repo;
    $("board").value = settings.board;
    $("compact").checked = !!settings.compact;
  }
});

$("settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const next = {
    appUrl: $("appUrl").value.trim().replace(/\/+$/, ""),
    repo: $("repo").value.trim(),
    board: $("board").value.trim(),
    compact: $("compact").checked,
  };
  const err = checkAppUrl(next.appUrl);
  $("settingsErr").hidden = !err;
  $("settingsErr").textContent = err;
  if (err) return;
  await saveSettings(next);
  $("settings").hidden = true;
  $("gear").setAttribute("aria-pressed", "false");
  load();
});

chrome.commands.getAll().then((cs) => {
  const c = cs.find((x) => x.name === "toggle-talk");
  $("shortcut").textContent = (c && c.shortcut) || "not set";
}).catch(() => {});

chrome.storage.sync.onChanged.addListener(() => load());

load().then(pendingTalk);
checkMic();
