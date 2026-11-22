// Settings shared by the popup, the side panel and the welcome page.
"use strict";

const DEFAULTS = { appUrl: "http://localhost:3000", repo: "cherylaurelia/yc-hacky", board: "", compact: false };

async function getSettings() {
  try {
    return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  } catch {
    return { ...DEFAULTS };
  }
}

const saveSettings = (s) => chrome.storage.sync.set(s);

// The extension's host permissions cover the app on this machine only.
function checkAppUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return "That isn't a web address."; }
  if (!/^https?:$/.test(u.protocol) || !["localhost", "127.0.0.1"].includes(u.hostname)) return "Use the app on this computer, for example http://localhost:3000.";
  return "";
}

const appOrigin = (s) => new URL(s.appUrl).origin;

function pageUrl(s) {
  const u = new URL("/", s.appUrl);
  u.searchParams.set("repo", s.repo);
  if (s.board) u.searchParams.set("board", String(s.board));
  if (s.compact) u.searchParams.set("embed", "1");
  return u.href;
}
