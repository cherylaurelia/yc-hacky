// Tries the prompt diffs in qa/proposed-fixes.md on a SCRATCH copy of the agent, so the live agent
// (agent.json) is never touched. It reads the prompt from scripts/sync-agent.ts, applies the
// replacements below, and creates a separate ElevenLabs agent that reuses the same tool ids.
//   node --env-file=$HOME/.yc-hacky.env qa/try-fix.ts           prints the scratch agent id
//   QA_AGENT_ID=<id> node --env-file=... qa/run.ts --only digest,long-winded   run scenarios on it
//   node --env-file=$HOME/.yc-hacky.env qa/try-fix.ts --delete <id>            remove it again
import { readFileSync } from "node:fs";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set. Run with: node --env-file=$HOME/.yc-hacky.env qa/try-fix.ts");
const API = "https://api.elevenlabs.io";

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": KEY!, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const del = process.argv.indexOf("--delete");
if (del > 0) {
  const id = process.argv[del + 1];
  if (!/^agent_[a-z0-9]+$/.test(id ?? "")) throw new Error("usage: --delete agent_...");
  if (id === (JSON.parse(readFileSync(new URL("../agent.json", import.meta.url), "utf8")) as { agent_id: string }).agent_id) throw new Error("refusing to delete the live agent");
  await api("DELETE", `/v1/convai/agents/${id}`);
  console.log(`deleted ${id}`);
  process.exit(0);
}

// [old, new] pairs, exactly as listed in qa/proposed-fixes.md.
const PATCHES: [string, string][] = [
  [
    "- You are speaking out loud. Answer in one to three short sentences.",
    '- You are speaking out loud. Hard limit: three short sentences and about 40 words, for every answer, including digests, commit lists, files and overviews. Say the headline and the one or two items that matter, never every item. Leave the rest unsaid, the user will ask. Never end an answer by offering more help.',
  ],
  [
    "work out how many hours back that is from the current local time, then call recent_activity with that number of hours.",
    "work out silently how many hours back that is from the current local time. Do not say the time or the arithmetic. Call recent_activity with that number of hours.",
  ],
  [
    "If the notice lists several posts, say one short sentence for each, at most three, then ask.",
    "If the notice lists several posts, say one short sentence for each, at most three sentences in total, the last one being the question.",
  ],
];

const src = readFileSync(new URL("../scripts/sync-agent.ts", import.meta.url), "utf8");
const m = src.match(/const PROMPT = `([\s\S]*?)`;\n/);
if (!m) throw new Error("could not find PROMPT in scripts/sync-agent.ts");
let prompt = m[1];
for (const [a, b] of PATCHES) {
  if (!prompt.includes(a)) throw new Error(`prompt no longer contains: ${a.slice(0, 60)}...`);
  prompt = prompt.replace(a, b);
}
const { tool_ids } = JSON.parse(readFileSync(new URL("../agent.json", import.meta.url), "utf8")) as { tool_ids: Record<string, string> };
const res = (await api("POST", "/v1/convai/agents/create", {
  name: "QA scratch copy (safe to delete)",
  conversation_config: {
    agent: {
      first_message: "Hey, I'm plugged into {{repo}} and your agent board. I'll speak up if an agent needs you. What do you want to know?",
      language: "en",
      dynamic_variables: { dynamic_variable_placeholders: { repo: "owner/name", now: "unknown" } },
      prompt: { prompt, llm: "claude-sonnet-5-5", temperature: 0.3, tool_ids: Object.values(tool_ids) },
    },
    tts: { model_id: "eleven_flash_v2" },
  },
  platform_settings: { auth: { enable_auth: true }, overrides: { conversation_config_override: { conversation: { text_only: true } } } },
})) as { agent_id?: string };
if (!res.agent_id) throw new Error("no agent id came back");
console.log(res.agent_id);
