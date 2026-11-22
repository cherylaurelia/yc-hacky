// Coworker popup — UI demo. All data below is made up; nothing talks to GitHub or ElevenLabs yet.
"use strict";

const ME = "aidanyee17";

const AGENTS = {
  cheryl: { name: "Cheryl's Claude", short: "C", color: "#f0883e" },
  eithan: { name: "Eithan's Codex", short: "E", color: "#58a6ff" },
  aidan: { name: "Aidan's Claude", short: "A", color: "#bc8cff" },
  worker: { name: "Board worker", short: "W", color: "#56d364" },
  coworker: { name: "Coworker", short: "◉", color: "#8b949e" },
};

// Highest priority first. The queue is grouped and ordered by this list.
const KINDS = [
  { key: "approval", label: "Needs approval", cls: "p0" },
  { key: "blocked", label: "Blocked", cls: "p1" },
  { key: "ask", label: "Asks you", cls: "p2" },
  { key: "progress", label: "In progress", cls: "p3" },
  { key: "done", label: "Done", cls: "p4" },
];

let items = [
  { id: 1, agent: "aidan", kind: "approval", mins: 1, req: "3fa9c1", mine: true,
    text: "wants to run <code>npm install @elevenlabs/client</code> in yc-hacky",
    thread: [{ from: "aidan", text: "Needs approval (req 3fa9c1): Bash <code>npm install @elevenlabs/client</code> in yc-hacky", mins: 1 }] },
  { id: 2, agent: "eithan", kind: "approval", mins: 4, req: "b71e02", mine: false,
    text: "wants to edit <code>app/api/standup/route.ts</code> (Cheryl's folder)",
    thread: [{ from: "eithan", text: "Needs approval (req b71e02): Edit <code>app/api/standup/route.ts</code>. It's in Cheryl's folder, asking for a handoff.", mins: 4 }] },
  { id: 3, agent: "cheryl", kind: "blocked", mins: 6, mine: false,
    text: "chat page needs <b>ANTHROPIC_API_KEY</b> in .env before <code>app/api/chat</code> works",
    thread: [
      { from: "cheryl", text: "Installed assistant-ui into the root app. New: <code>app/chat</code>, <code>app/api/chat</code>.", mins: 11 },
      { from: "cheryl", text: "Blocked: chat page needs <b>ANTHROPIC_API_KEY</b> in .env before <code>app/api/chat</code> works. Who has one?", mins: 6 },
    ] },
  { id: 4, agent: "eithan", kind: "ask", mins: 9, mine: true,
    text: "<b>@aidanyee17</b> can you own the Chrome extension? I'll keep the Mac app",
    thread: [{ from: "eithan", text: "<b>@aidanyee17</b> can you own the Chrome extension? I'll keep the Mac app. Needs the board queue + a mic.", mins: 9 }] },
  { id: 5, agent: "worker", kind: "progress", mins: 3, mine: false,
    text: "on it: add retry to <code>lib/eleven.ts</code> when the dialogue API rate-limits",
    thread: [{ from: "worker", text: "On it: add retry to <code>lib/eleven.ts</code> when the dialogue API rate-limits. Worktree <code>task-412</code>.", mins: 3 }] },
  { id: 6, agent: "eithan", kind: "progress", mins: 14, mine: false,
    text: "wiring fn push-to-talk into <code>macos/Coworker/PttMonitor.swift</code>",
    thread: [{ from: "eithan", text: "Wiring fn push-to-talk into <code>macos/Coworker/PttMonitor.swift</code>. ETA 20 min.", mins: 14 }] },
  { id: 7, agent: "cheryl", kind: "done", mins: 22, mine: false,
    text: "merged multi-voice standup, PR #9. Try <code>/api/standup?hours=3</code>",
    thread: [{ from: "cheryl", text: "Done: merged multi-voice standup, PR #9. Try <code>/api/standup?hours=3</code>.", mins: 22 }] },
  { id: 8, agent: "worker", kind: "done", mins: 31, mine: false,
    text: "done: dark redesign tokens, PR #7",
    thread: [{ from: "worker", text: "Done: dark redesign tokens, PR #7.", mins: 31 }] },
];

const state = { view: "queue", filter: "all", open: null, coworkerThread: [] };

const $ = (id) => document.getElementById(id);
const body = $("body");
const ago = (m) => (m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`);
const plain = (html) => html.replace(/<[^>]+>/g, "");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function avatar(agentKey) {
  const a = AGENTS[agentKey];
  return `<span class="av" style="--a:${a.color}" aria-hidden="true">${a.short}</span>`;
}

function render() {
  const inThread = state.view === "thread";
  $("back").hidden = !inThread;
  $("seg").hidden = inThread;
  if (inThread) renderThread();
  else renderQueue();
}

function renderQueue() {
  $("title").textContent = "Coworker";
  const open = items.filter((i) => i.kind === "approval" && !i.resolved).length;
  $("sub").textContent = `yc-hacky · board #1${open ? ` · ${open} waiting` : ""}`;

  const shown = items.filter((i) => state.filter === "all" || i.mine);
  if (!shown.length) {
    body.innerHTML = `<p class="empty">Nothing needs you right now.</p>`;
    return;
  }
  body.innerHTML = KINDS.map((k) => {
    const list = shown.filter((i) => i.kind === k.key).sort((a, b) => a.mins - b.mins);
    if (!list.length) return "";
    return `<section class="group ${k.cls}">
      <h2><i></i>${k.label} <span class="n">${list.length}</span></h2>
      ${list.map((i) => row(i, k)).join("")}
    </section>`;
  }).join("");
}

function row(i, k) {
  const a = AGENTS[i.agent];
  const acts = i.kind === "approval"
    ? i.resolved
      ? `<div class="resolved ${i.resolved === "deny" ? "no" : ""}">${i.resolved === "allow" ? "✓ Allowed" : "✕ Denied"} · posted to board</div>`
      : `<div class="acts">
          <button class="btn go" data-act="allow" data-id="${i.id}">Allow</button>
          <button class="btn" data-act="deny" data-id="${i.id}">Deny</button>
          <span class="req">req ${i.req}</span>
        </div>`
    : "";
  return `<div class="item ${k.cls}" role="button" tabindex="0" data-open="${i.id}" aria-label="${esc(a.name)}: ${esc(plain(i.text))}">
    ${avatar(i.agent)}
    <div>
      <div class="meta"><span class="who">${a.name}</span><span class="time">${ago(i.mins)}</span></div>
      <div class="text">${i.text}</div>
      ${acts}
    </div>
  </div>`;
}

function renderThread() {
  const item = state.open === "coworker" ? null : items.find((i) => i.id === state.open);
  const msgs = item ? item.thread : state.coworkerThread;
  $("title").textContent = item ? AGENTS[item.agent].name : "Coworker";
  $("sub").textContent = item ? `${KINDS.find((k) => k.key === item.kind).label.toLowerCase()} · board #1` : "voice assistant · yc-hacky";
  body.innerHTML = `<div class="thread">${msgs.map(bubble).join("")}</div>`;
  body.scrollTop = body.scrollHeight;
}

function bubble(m) {
  const me = m.from === "me";
  const who = me ? `<span class="av" style="--a:#bc8cff" aria-hidden="true">A</span>` : avatar(m.from);
  if (m.typing) return `<div class="msg typing">${who}<div class="bubble"><span class="dots">Thinking</span></div></div>`;
  return `<div class="msg ${me ? "me" : ""}">${who}<div class="bubble">${m.text}<span class="t">${me ? "you" : AGENTS[m.from].name} · ${ago(m.mins)}</span></div></div>`;
}

// ---- actions ----

function openThread(id) {
  state.view = "thread";
  state.open = id;
  render();
}

function resolve(id, verdict) {
  const i = items.find((x) => x.id === id);
  if (!i || i.resolved) return;
  i.resolved = verdict;
  i.thread.push({ from: "me", text: `req ${i.req} ${verdict}`, mins: 0 });
  render();
}

function send(text) {
  text = text.trim();
  if (!text) return;
  if (state.view === "queue") {
    state.open = "coworker";
    state.view = "thread";
  }
  const thread = state.open === "coworker" ? state.coworkerThread : items.find((i) => i.id === state.open).thread;
  thread.push({ from: "me", text: esc(text), mins: 0 });
  if (state.open === "coworker") {
    const typing = { typing: true };
    thread.push(typing);
    setTimeout(() => {
      thread.splice(thread.indexOf(typing), 1, { from: "coworker", text: answer(text), mins: 0 });
      render();
    }, 900);
  } else {
    const item = items.find((i) => i.id === state.open);
    const m = text.match(/\b(allow|approve|yes|deny|no)\b/i);
    if (item.kind === "approval" && m && !item.resolved) item.resolved = /allow|approve|yes/i.test(m[1]) ? "allow" : "deny";
  }
  render();
}

// Canned replies for the demo. The real one is the ElevenLabs agent with its board tools.
function answer(q) {
  const waiting = items.filter((i) => i.kind === "approval" && !i.resolved);
  if (/block/i.test(q)) return "One blocker: Cheryl's chat page needs <b>ANTHROPIC_API_KEY</b> in .env. Nobody has replied yet.";
  if (/approv|waiting|need/i.test(q) && waiting.length)
    return `${waiting.length} waiting on approval: ${waiting.map((i) => `${AGENTS[i.agent].name} (${plain(i.text)})`).join("; ")}.`;
  if (/eithan/i.test(q)) return "Eithan's Codex is wiring fn push-to-talk into the Mac app, ETA about 20 minutes. It also asked you to own the Chrome extension.";
  const top = items.find((i) => !i.resolved && i.kind !== "done");
  return top ? `Top of the queue: ${AGENTS[top.agent].name} ${plain(top.text)}.` : "The board is quiet. Nothing needs you.";
}

// ---- mic: hold to talk (simulated transcript in this demo) ----

const SAMPLES = {
  queue: ["What's blocking the team?", "What needs my approval?", "What is Eithan working on?"],
  thread: ["Allow it, go ahead", "Yes, I'll take the Chrome extension", "Thanks, looks good"],
};
let sample = 0, talking = false, tick = null, words = "", typed = 0;
const bars = $("bars");
bars.innerHTML = "<span></span>".repeat(14);

function startTalk() {
  if (talking) return;
  talking = true;
  const pool = state.view === "queue" ? SAMPLES.queue : SAMPLES.thread;
  words = pool[sample++ % pool.length];
  typed = 0;
  $("mic").classList.add("on");
  $("mic").setAttribute("aria-pressed", "true");
  $("listening").hidden = false;
  $("listenText").textContent = "Listening · release to send";
  let t = 0;
  tick = setInterval(() => {
    t++;
    [...bars.children].forEach((b, i) => { b.style.height = `${4 + Math.abs(Math.sin(t / 2 + i)) * 12 * Math.random()}px`; });
    if (t > 4 && t % 2 === 0 && typed < words.length) {
      typed = Math.min(words.length, words.indexOf(" ", typed + 1) === -1 ? words.length : words.indexOf(" ", typed + 1));
      $("listenText").textContent = `“${words.slice(0, typed)}”`;
    }
  }, 70);
}

function stopTalk() {
  if (!talking) return;
  talking = false;
  clearInterval(tick);
  $("mic").classList.remove("on");
  $("mic").setAttribute("aria-pressed", "false");
  $("listening").hidden = true;
  if (typed) send(words.slice(0, typed));
}

const mic = $("mic");
mic.addEventListener("pointerdown", (e) => { e.preventDefault(); mic.setPointerCapture(e.pointerId); startTalk(); });
mic.addEventListener("pointerup", stopTalk);
mic.addEventListener("pointercancel", stopTalk);
// Space talks only when nothing interactive has focus, so Space still clicks a focused button.
const spaceTalks = () => !document.activeElement?.closest("input, textarea, button, [role='button'], [role='tab'], a");
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && spaceTalks()) { e.preventDefault(); startTalk(); }
});
document.addEventListener("keyup", (e) => { if (e.code === "Space") stopTalk(); });

// ---- wiring ----

body.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  if (act) { e.stopPropagation(); resolve(Number(act.dataset.id), act.dataset.act); return; }
  const it = e.target.closest("[data-open]");
  if (it) openThread(Number(it.dataset.open));
});
body.addEventListener("keydown", (e) => {
  const it = e.target.closest("[data-open]");
  if (it && (e.key === "Enter") && !e.target.closest("[data-act]")) openThread(Number(it.dataset.open));
});
$("back").addEventListener("click", () => { state.view = "queue"; state.open = null; render(); });
$("seg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  state.filter = b.dataset.filter;
  [...$("seg").children].forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  render();
});
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  send($("input").value);
  $("input").value = "";
});

render();
