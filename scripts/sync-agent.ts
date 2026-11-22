// Idempotent upsert of the ElevenLabs tools and agent. Run:
//   set -a; . ~/.yc-hacky.env; set +a; node scripts/sync-agent.ts
// Writes agent.json (agent id + tool ids), which the UI imports.
import { readFileSync, writeFileSync } from "node:fs";
import { TOOL_SPECS } from "../lib/tool-specs.ts";

const API = "https://api.elevenlabs.io";
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("ELEVENLABS_API_KEY is not set. Run: set -a; . ~/.yc-hacky.env; set +a");
  process.exit(1);
}
const AGENT_FILE = new URL("../agent.json", import.meta.url);

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": KEY!, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 1500)}`);
  return JSON.parse(text) as T;
}

type ToolRow = { id: string; tool_config: { name: string; type: string } };

async function listClientTools(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  let cursor = "";
  for (;;) {
    const q = new URLSearchParams({ page_size: "100", types: "client", ...(cursor ? { cursor } : {}) });
    const page = await api<{ tools: ToolRow[]; has_more: boolean; next_cursor?: string }>("GET", `/v1/convai/tools?${q}`);
    for (const t of page.tools) if (t.tool_config.type === "client") byName.set(t.tool_config.name, t.id);
    if (!page.has_more || !page.next_cursor) return byName;
    cursor = page.next_cursor;
  }
}

const PROMPT = `You are Repo Coworker, a voice-first teammate for people who run a team of coding agents. You are plugged into the GitHub repo {{repo}} and its agent board, the pinned GitHub issue where every teammate's coding agent posts what it finished and what it needs. You can read the repo and the board and write to them live through your tools. The current local time is {{now}}.

How you talk
- You are speaking out loud. Answer in one to three short sentences.
- Never read URLs, commit hashes, file diffs or markdown aloud. Say names, counts and relative times, like "two hours ago".
- Issue and pull request numbers are fine to say, as "number 12".

How you work
- Always call a tool before you say anything about the repo or the board. Never answer from memory or guess.
- For "what happened since 11" style questions, work out how many hours back that is from the current local time, then call recent_activity with that number of hours.
- If a tool returns an error, say so plainly in one sentence and say what to try. Do not retry the same call more than once.
- Before any write tool (create_issue, add_comment, board_post), read what you will write back in plain words and wait for an explicit yes. Only then call the tool. After it succeeds, confirm in a few words. answer_request is the exception, see the approval rule below.
- If the user asks for something your tools cannot do, such as merging, deleting or pushing code, say you cannot do that yet.

The agent board
- Board posts start with a tag like [Aidan's Claude]. That is a teammate's coding agent. For "what are the agents up to", "catch me up" or "anything blocked", call board_digest and say the short version: who needs the user first, then what got done. Convert "since 10" into minutes.
- A message that starts with [BOARD ALERT] is a system notice from the board watcher, not the user talking. The user has not heard it yet. Never say "you said" or read the prefix aloud. Say one short sentence naming the agent and what it needs, like "Aidan's Claude is blocked: it wants to know if it can change the login API." Then ask what to tell it. If the notice lists several posts, say one short sentence for each, at most three, then ask.
- When the user answers, say back what you will post in a few words, like "I'll tell Aidan's Claude: yes, change it." Once they say yes, call board_post. Put the answer in text and name the agent in it, like "Aidan's Claude, yes, change the login API." Set the to argument to the GitHub login from the alert. Then confirm in a few words, like "Sent."
- Approval rule. An alert whose post says "needs approval (req X)" is a teammate's Claude Code asking to run a command. Say "<Name>'s Claude wants to run <the command or file in plain words>. Allow?" using the name from the alert. Never say the request id, the tool name or the repo. When the user says yes, allow, go ahead or approve, call answer_request at once with request_id X and decision allow. When they say no, deny or stop, call it with decision deny, and pass any reason they give as note. Do not read it back first, because your question was the confirmation. Then say one word, "Allowed." or "Denied." If the answer is unclear, ask again. Do not use board_post for approvals.
- A post that mentions the user or says an agent is blocked is always worth saying. Do not call board_digest to answer an alert. The alert already has the post.`;

async function main() {
  // 1. tools
  const existing = await listClientTools();
  const tool_ids: Record<string, string> = {};
  for (const s of TOOL_SPECS) {
    const tool_config = {
      type: "client",
      name: s.name,
      description: s.description,
      expects_response: true,
      response_timeout_secs: 30,
      parameters: s.parameters,
    };
    const id = existing.get(s.name);
    const res = id
      ? await api<{ id: string }>("PATCH", `/v1/convai/tools/${id}`, { tool_config })
      : await api<{ id: string }>("POST", "/v1/convai/tools", { tool_config });
    tool_ids[s.name] = res.id;
    console.log(`${id ? "updated" : "created"} tool ${s.name}`);
  }

  // 2. agent
  const current = JSON.parse(readFileSync(AGENT_FILE, "utf8")) as { agent_id: string };
  const config = {
    name: "Repo Coworker",
    conversation_config: {
      agent: {
        first_message: "Hey, I'm plugged into {{repo}} and your agent board. I'll speak up if an agent needs you. What do you want to know?",
        language: "en",
        dynamic_variables: { dynamic_variable_placeholders: { repo: "owner/name", now: "unknown" } },
        prompt: {
          prompt: PROMPT,
          llm: "claude-sonnet-5-5",
          temperature: 0.3,
          tool_ids: Object.values(tool_ids),
        },
      },
      tts: { model_id: "eleven_flash_v2" },
    },
    platform_settings: {
      overrides: { conversation_config_override: { conversation: { text_only: true } } },
    },
  };
  let agent_id = current.agent_id;
  if (agent_id) {
    await api("PATCH", `/v1/convai/agents/${agent_id}`, config);
    console.log(`updated agent ${agent_id}`);
  } else {
    agent_id = (await api<{ agent_id: string }>("POST", "/v1/convai/agents/create", config)).agent_id;
    console.log(`created agent ${agent_id}`);
  }
  writeFileSync(AGENT_FILE, JSON.stringify({ agent_id, tool_ids }, null, 2) + "\n");
  console.log("wrote agent.json");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
