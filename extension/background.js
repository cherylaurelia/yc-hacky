// Coworker extension service worker: the talk shortcut, and the voice state on the toolbar badge.
// The toolbar icon opens the popup (the queue); the side panel runs the full Coworker page.

const BADGE = {
  listening: { text: "●", color: "#2e6542" },
  speaking: { text: "♪", color: "#221d17" },
  connecting: { text: "…", color: "#73695d" },
};

const panels = new Set(); // ports from open side panels

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  panels.add(port);
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (!panels.size) chrome.action.setBadgeText({ text: "" });
  });
});

// Panel open: start or stop talking. Panel closed: open it and start talking. sidePanel.open must be
// called straight away (no await before it), or Chrome no longer counts the shortcut as a user gesture.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-talk") return;
  if (panels.size) {
    for (const p of panels) p.postMessage({ type: "toggle-talk" });
    return;
  }
  if (tab && tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    chrome.storage.session.set({ talkNow: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "state") {
    const b = BADGE[msg.state];
    chrome.action.setBadgeText({ text: b ? b.text : "" });
    if (b) chrome.action.setBadgeBackgroundColor({ color: b.color });
    chrome.action.setTitle({ title: msg.state && STATE_TITLES[msg.state] ? `Coworker: ${STATE_TITLES[msg.state]}` : "Coworker" });
  }
});

const STATE_TITLES = { listening: "listening", speaking: "speaking", connecting: "connecting" };
