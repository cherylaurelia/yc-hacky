// Coworker popup: the board as a priority queue. Reads and writes go through the Coworker app
// (GET /api/board/recent, POST /api/tool/answer_request and /api/tool/board_post) from a hidden
// frame on the app's origin (extension/relay.js), so they run as the Coworker page would.
"use strict";

const $ = (id) => document.getElementById(id);
const body = $("body");

// Highest priority first. The queue is grouped and ordered by this list.
const KINDS = [
  { key: "approval", label: "Needs approval", cls: "p0" },
  { key: "blocked", label: "Blocked", cls: "p1" },
  { key: "ask", label: "Asks you", cls: "p2" },
  { key: "progress", label: "In progress", cls: "p3" },
  { key: "done", label: "Done", cls: "p4" },
];
const AVATAR_COLORS = ["#f0883e", "#58a6ff", "#bc8cff", "#56d364", "#e3b341", "#ff7b72", "#79c0ff"];
const ANSWER = /^\s*req\s+[0-9a-f]{4,12}\s+(?:allow|approved?|yes|deny|denied|no|reject(?:ed)?|stop)\b/i;
const POLL_MS = 15_000;

const state = { view: "queue", filter: "all", open: null, data: null, error: "", busy: new Set(), sent: new Map() };
let settings;
let windowId = null;

// ---------- the relay frame ----------

let relay = null;
let relayReady = null;
const waiting = new Map();
let seq = 0;

function startRelay() {
  relayReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("offline")), 8000);
    window.addEventListener("message", function ready(e) {
      if (e.origin !== appOrigin(settings) || !e.data) return;
      if (e.data.coworker === "relay-ready") {
        clearTimeout(timer);
        window.removeEventListener("message", ready);
        resolve();
      }
    });
  });
  relay = document.createElement("iframe");
  relay.hidden = true;
  relay.title = "Coworker relay";
  relay.src = `${appOrigin(settings)}/ext/relay`;
  document.body.append(relay);
}

window.addEventListener("message", (e) => {
  if (!settings || e.origin !== appOrigin(settings) || !e.data || e.data.coworker !== "api-reply") return;
  const done = waiting.get(e.data.id);
  if (done) { waiting.delete(e.data.id); done(e.data); }
});

async function api(path, { method = "GET", body: payload } = {}) {
  await relayReady;
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, status: 0, json: { error: "Coworker took too long to answer." } }); }, 20_000);
    waiting.set(id, (r) => { clearTimeout(timer); resolve(r); });
    relay.contentWindow.postMessage({ coworker: "api", id, method, path, body: payload }, appOrigin(settings));
  });
}

// ---------- data ----------

async function refresh() {
  const q = new URLSearchParams({ repo: settings.repo, minutes: "240", limit: "80" });
  if (settings.board) q.set("board", settings.board);
  const r = await api(`/api/board/recent?${q}`);
  if (r.ok) {
    state.data = r.json;
    state.error = "";
  } else {
    state.error = (r.json && r.json.error) || `Coworker answered ${r.status}.`;
  }
  render();
}

// Turns posts (oldest first) into queue items. Every open request and blocker shows; for anything
// else only each agent's latest post shows, so the queue stays short.
function queue(data) {
  const me = (data.me || "").toLowerCase();
  const answered = new Set([...(data.answered || []), ...state.sent.keys()]);
  const posts = data.posts.filter((p) => !p.relay && !ANSWER.test(p.text));
  const latest = new Map();
  for (const p of posts) latest.set(p.agent, p);
  // A question to you counts as answered once you (or your agent) post after it.
  const myLast = Math.max(0, ...data.posts.filter((p) => p.login.toLowerCase() === me).map((p) => p.id));

  const items = [];
  for (const p of posts) {
    const isLatest = latest.get(p.agent) === p;
    let kind = null;
    let resolved = null;
    if ((p.kind === "approval" || p.kind === "stuck") && p.req) {
      if (answered.has(p.req)) {
        if (!isLatest) continue;
        resolved = state.sent.get(p.req) || "answered";
        kind = "done";
      } else {
        kind = p.kind === "approval" ? "approval" : "blocked";
      }
    } else if (p.mention && !p.ctx) {
      // Typed posts that mention you are questions, even when a word like "blocks" matches.
      if (p.id > myLast) kind = "ask";
      else if (isLatest) kind = "progress";
    } else if (p.blocked && isLatest) kind = "blocked";
    else if (isLatest) kind = p.kind === "done" || /\b(?:done|merged|shipped|landed|finished|fixed)\b/i.test(p.text) ? "done" : "progress";
    if (kind) items.push({ ...p, q: kind, resolved, mine: p.mention || p.login.toLowerCase() === me });
  }
  return items;
}

// ---------- rendering ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const backticks = (s) => esc(s).replace(/`([^`]{1,200})`/g, "<code>$1</code>");

function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

function avatar(agent) {
  let h = 0;
  for (const c of agent) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letter = (agent.match(/[A-Za-z0-9]/) || ["?"])[0].toUpperCase();
  return `<span class="av" style="--a:${AVATAR_COLORS[h % AVATAR_COLORS.length]}" aria-hidden="true">${esc(letter)}</span>`;
}

function render() {
  const inThread = state.view === "thread";
  $("back").hidden = !inThread;
  $("seg").hidden = inThread;
  $("input").placeholder = inThread ? `Reply to ${state.open}…` : "Post to the board…";
  body.setAttribute("aria-busy", "false");
  if (inThread) renderThread();
  else renderQueue();
}

function renderQueue() {
  $("title").textContent = "Coworker";
  if (state.error && !state.data) {
    $("sub").textContent = settings.repo;
    $("live").className = "live off";
    body.innerHTML = `<div class="empty"><p>${esc(state.error)}</p></div>`;
    return;
  }
  const items = queue(state.data);
  const waitingCount = items.filter((i) => i.q === "approval").length;
  $("live").className = state.error ? "live off" : "live";
  $("sub").textContent = `${settings.repo} · board #${state.data.board}${waitingCount ? ` · ${waitingCount} waiting` : ""}`;

  const shown = items.filter((i) => state.filter === "all" || i.mine);
  if (!shown.length) {
    body.innerHTML = `<p class="empty">${state.filter === "mine" ? "Nothing needs you right now." : "The board has been quiet for 4 hours."}</p>`;
    return;
  }
  body.innerHTML = KINDS.map((k) => {
    const list = shown.filter((i) => i.q === k.key).sort((a, b) => b.id - a.id);
    if (!list.length) return "";
    return `<section class="group ${k.cls}">
      <h2><i></i>${k.label} <span class="n">${list.length}</span></h2>
      ${list.map((i) => row(i, k)).join("")}
    </section>`;
  }).join("");
}

function row(i, k) {
  let acts = "";
  if (i.resolved) {
    const word = i.resolved === "allow" ? "✓ Allowed" : i.resolved === "deny" ? "✕ Denied" : i.resolved === "stop" ? "■ Stopped" : "✓ Answered";
    acts = `<div class="resolved ${i.resolved === "deny" || i.resolved === "stop" ? "no" : ""}">${word} · req ${esc(i.req)}</div>`;
  } else if (i.req && (i.q === "approval" || i.q === "blocked")) {
    const busy = state.busy.has(i.req) ? "disabled" : "";
    acts = i.kind === "stuck"
      ? `<div class="acts"><button class="btn" data-act="stop" data-req="${esc(i.req)}" ${busy}>Stop it</button><span class="req">req ${esc(i.req)}</span></div>`
      : `<div class="acts">
          <button class="btn go" data-act="allow" data-req="${esc(i.req)}" ${busy}>Allow</button>
          <button class="btn" data-act="deny" data-req="${esc(i.req)}" ${busy}>Deny</button>
          <span class="req">req ${esc(i.req)}</span>
        </div>`;
  }
  return `<div class="item ${k.cls}" role="button" tabindex="0" data-open="${esc(i.agent)}" aria-label="${esc(i.agent)}: ${esc(i.text)}">
    ${avatar(i.agent)}
    <div>
      <div class="meta"><span class="who">${esc(i.agent)}</span><span class="time">${ago(i.at)}</span></div>
      <div class="text">${backticks(i.text)}</div>
      ${acts}
    </div>
  </div>`;
}

function renderThread() {
  const agent = state.open;
  const me = (state.data.me || "").toLowerCase();
  const first = agent.split(/['’]/)[0].toLowerCase();
  const msgs = state.data.posts.filter((p) => p.agent === agent || (p.relay && p.login.toLowerCase() === me && p.text.toLowerCase().includes(first)));
  $("title").textContent = agent;
  $("sub").textContent = `last 4 hours · board #${state.data.board}`;
  body.innerHTML = msgs.length
    ? `<div class="thread">${msgs.map((p) => {
        const mine = p.relay && p.login.toLowerCase() === me;
        return `<div class="msg ${mine ? "me" : ""}">${avatar(p.agent)}<div class="bubble">${backticks(p.text)}<span class="t">${esc(p.agent)} · ${ago(p.at)}</span></div></div>`;
      }).join("")}</div>`
    : `<p class="empty">No posts from ${esc(agent)} in the last 4 hours.</p>`;
  body.scrollTop = body.scrollHeight;
}

function toast(text, bad) {
  const t = $("toast");
  t.textContent = text;
  t.className = `toast ${bad ? "bad" : ""}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---------- actions ----------

async function answer(req, decision) {
  if (state.busy.has(req)) return;
  state.busy.add(req);
  render();
  const args = { request_id: req, decision };
  if (settings.board) args.board = Number(settings.board);
  const r = await api("/api/tool/answer_request", { method: "POST", body: { repo: settings.repo, args } });
  state.busy.delete(req);
  if (r.ok) {
    state.sent.set(req, decision);
    toast(`Sent ${decision} for req ${req}.`);
  } else {
    toast((r.json && r.json.error) || "That didn't go through.", true);
  }
  render();
}

async function post(text) {
  text = text.trim();
  if (!text) return;
  const args = { text };
  if (state.view === "thread") {
    args.text = `${state.open}, ${text}`;
    const p = [...state.data.posts].reverse().find((x) => x.agent === state.open);
    if (p) args.to = p.login;
  }
  if (settings.board) args.board = Number(settings.board);
  const r = await api("/api/tool/board_post", { method: "POST", body: { repo: settings.repo, args } });
  if (r.ok) {
    $("input").value = "";
    toast("Posted to the board.");
    refresh();
  } else {
    toast((r.json && r.json.error) || "That didn't go through.", true);
  }
}

// The voice lives in the side panel: open it and start talking. sidePanel.open has to run
// straight from the click, so the window id is looked up when the popup opens.
function talk() {
  if (windowId === null) return;
  chrome.sidePanel.open({ windowId }).then(() => window.close()).catch(() => toast("Couldn't open the side panel.", true));
  chrome.storage.session.set({ talkNow: true }).catch(() => {});
}

// ---------- wiring ----------

body.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  if (act) { e.stopPropagation(); answer(act.dataset.req, act.dataset.act); return; }
  const it = e.target.closest("[data-open]");
  if (it) { state.view = "thread"; state.open = it.dataset.open; render(); }
});
body.addEventListener("keydown", (e) => {
  const it = e.target.closest("[data-open]");
  if (it && e.key === "Enter" && !e.target.closest("[data-act]")) { state.view = "thread"; state.open = it.dataset.open; render(); }
});
$("back").addEventListener("click", () => { state.view = "queue"; state.open = null; render(); });
$("seg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  state.filter = b.dataset.filter;
  [...$("seg").children].forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  render();
});
$("form").addEventListener("submit", (e) => { e.preventDefault(); post($("input").value); });
$("mic").addEventListener("click", talk);

async function main() {
  settings = await getSettings();
  try { windowId = (await chrome.windows.getCurrent()).id; } catch { /* outside Chrome */ }
  startRelay();
  try {
    await relayReady;
  } catch {
    $("live").className = "live off";
    $("sub").textContent = "not running";
    body.innerHTML = `<div class="empty"><p>Coworker isn't running at <code>${esc(settings.appUrl)}</code>.</p><p>Run <code>npm run dev</code> in your yc-hacky checkout, then open this again.</p></div>`;
    return;
  }
  await refresh();
  setInterval(() => { if (!state.busy.size) refresh(); }, POLL_MS);
}
main();
