// Headless text conversation with the live agent, no mic. Runs the same
// client tools the browser does, against the local /api/tool route.
//   node scripts/text-chat.ts owner/name "what happened recently?" ["follow up" ...]
// Needs `npm run dev` (with GITHUB_TOKEN) on TOOL_BASE (default http://localhost:3000).
// It also runs the browser's board alert poll (every POLL_MS, default 15000) and injects
// each alert into the conversation. The step "/alert [seconds]" waits for the next alert
// and for the agent's spoken reaction to it. ALERT_VIA=context sends the alert with
// sendContextualUpdate instead of sendUserMessage, to compare whether the agent speaks.
import { readFileSync } from "node:fs";
import { Conversation } from "@elevenlabs/react";
import { type BoardCursor, alertMessage, pollBoard } from "../lib/board.ts";
import { localNow } from "../lib/now.ts";
import { parseRepo } from "../lib/repo.ts";
import { TOOL_SPECS } from "../lib/tool-specs.ts";

const BASE = process.env.TOOL_BASE ?? "http://localhost:3000";
const POLL_MS = Number(process.env.POLL_MS ?? 15_000);
const VIA = process.env.ALERT_VIA === "context" ? "context" : "message";
const [, , repoArg, ...messages] = process.argv;
const parsed = parseRepo(repoArg);
if (!parsed.ok || messages.length === 0) {
  console.error(`usage: node scripts/text-chat.ts owner/name "question" ["follow-up" ...]${parsed.ok ? "" : `\n${parsed.error}`}`);
  process.exit(2);
}
const repo = parsed.repo;
const { agent_id } = JSON.parse(readFileSync(new URL("../agent.json", import.meta.url), "utf8")) as { agent_id: string };
if (!agent_id) {
  console.error("agent.json has no agent_id. Run scripts/sync-agent.ts first.");
  process.exit(1);
}

let lastEvent = Date.now();
let pending = 0;
let agentMessages = 0;
const touch = () => (lastEvent = Date.now());

const clientTools = Object.fromEntries(
  TOOL_SPECS.map((s) => [
    s.name,
    async (args: Record<string, unknown>) => {
      pending++;
      touch();
      const t0 = Date.now();
      try {
        if ("local" in s) return `(headless: ${s.name} has no screen to show on)`;
        const res = await fetch(`${BASE}/api/tool/${s.name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo, args }),
          signal: AbortSignal.timeout(25_000),
        });
        const j = (await res.json()) as { result?: string; error?: string };
        if (!res.ok || j.result === undefined) throw new Error(j.error ?? `HTTP ${res.status}`);
        console.log(`  [tool] ${s.name}(${JSON.stringify(args)}) -> ${j.result.slice(0, 160).replace(/\s+/g, " ")}... (${Date.now() - t0} ms)`);
        return j.result;
      } catch (e) {
        console.log(`  [tool] ${s.name}(${JSON.stringify(args)}) FAILED: ${e instanceof Error ? e.message : e}`);
        throw e;
      } finally {
        pending--;
        touch();
      }
    },
  ]),
);

async function waitIdle(minAgentMessages: number, quietMs = 3000, maxMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 200));
    if (pending === 0 && agentMessages >= minAgentMessages && Date.now() - lastEvent > quietMs) return;
  }
  throw new Error("timed out waiting for the agent");
}

const conv = await Conversation.startSession({
  agentId: agent_id,
  textOnly: true,
  connectionType: "websocket",
  dynamicVariables: { repo, now: localNow() },
  clientTools,
  onMessage: ({ role, message }) => {
    touch();
    if (role === "agent") agentMessages++;
    console.log(`${role === "agent" ? "AGENT" : "USER "}: ${message}`);
  },
  onError: (m) => console.log(`  [error] ${m}`),
  onUnhandledClientToolCall: (c) => console.log(`  [unhandled tool call] ${c.tool_name}`),
});

// Same loop as components/Coworker.tsx: baseline cursor first, then alerts for newer posts.
let cursor: BoardCursor | undefined;
let delivered = 0;
async function tick() {
  try {
    const r = await pollBoard(repo, cursor, BASE);
    cursor = r.cursor;
    if (!r.alerts.length) return;
    const text = alertMessage(r.alerts);
    console.log(`  [board alert via ${VIA}] ${text.replace(/\s+/g, " ")}`);
    if (VIA === "context") conv.sendContextualUpdate(text);
    else conv.sendUserMessage(text);
    delivered++;
    touch();
  } catch (e) {
    console.log(`  [board] poll failed: ${e instanceof Error ? e.message : e}`);
  }
}

try {
  await waitIdle(1); // greeting
  await tick();
  console.log(`  [board] watching, cursor ${JSON.stringify(cursor)}`);
  const timer = setInterval(tick, POLL_MS);
  for (const m of messages) {
    const before = agentMessages;
    const wait = m.match(/^\/alert(?:\s+(\d+))?$/);
    if (wait) {
      const seen = delivered;
      const limit = Date.now() + Number(wait[1] ?? 90) * 1000;
      while (delivered === seen && Date.now() < limit) await new Promise((r) => setTimeout(r, 250));
      if (delivered === seen) throw new Error("no board alert arrived in time");
      touch();
      await waitIdle(before + 1, 3000, 25_000).catch(() => console.log("  [board] the agent said nothing after the alert"));
    } else {
      conv.sendUserMessage(m);
      touch();
      await waitIdle(before + 1);
    }
  }
  clearInterval(timer);
} finally {
  await conv.endSession();
}
process.exit(0);
