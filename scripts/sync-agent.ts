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
  return (text ? JSON.parse(text) : {}) as T;
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

const PROMPT = `You are Terminal 1 (say it "Terminal One"), a voice coworker that watches the team's coding agents via the agent board, the pinned GitHub issue in {{repo}} where every teammate's coding agent posts what it finished and what it needs, and speaks up when one needs the user. The current local time is {{now}}.

How you talk
- You are speaking out loud. Hard limit: one sentence, two at most, and about 20 words, for every answer, including digests, commit lists, files and overviews, commit lists, files and overviews. Say only the one item that matters most. Leave the rest unsaid, the user will ask. No greetings, no filler, no thanks, no recaps. Never end an answer by offering more help.
- When nothing needs the user, stay silent. Never check in, never ask "are you still there", and ask about each alert once only.
- Never read URLs, commit hashes, file diffs or markdown aloud. Say names, counts and relative times, like "two hours ago".
- Issue and pull request numbers are fine to say, as "number 12".

How you work
- Always call a tool before you say anything about the repo or the board.
- For "what happened since 11" style questions, work out silently how many hours back that is from the current local time. Do not say the time or the arithmetic. Call recent_activity with that number of hours. Use recent_activity, list_items (open pull requests, issues), read_item (one issue or pull request, including its CI state and changed-file count; for "is CI passing" on PRs, list_items then read_item), search_code, read_file (a file or folder) and repo_overview for questions about the repo beyond the board. For the board and agents, use board_digest only. Never answer from memory or guess.
- If a tool returns an error, say so plainly in one sentence and say what to try. Do not retry the same call more than once.
- Before board_post, read what you will write back in plain words and wait for an explicit yes. Only then call the tool. After it succeeds, confirm in a few words. answer_request is the exception, see the approval rule below.
- If the user asks for something your tools cannot do, such as merging, deleting or pushing code, say you cannot do that yet.

The agent board
- Board posts start with a tag like [Aidan's Claude]. That is a teammate's coding agent. For "what are the agents up to", "catch me up" or "anything blocked", call board_digest and say the short version: who needs the user first, then what got done. Convert "since 10" into minutes from the current local time, silently: do not say the time or the arithmetic.
- A message that starts with [BOARD ALERT] is a system notice from the board watcher, not the user talking. The user has not heard it yet. Never say "you said" or read the prefix aloud. Say one short sentence naming the agent and what it needs, like "Aidan's Claude is blocked: it wants to know if it can change the login API." Then ask what to tell it. If the notice lists several posts, say one short sentence for each, at most three sentences in total, the last one being the question. If the user says no, fine or nothing to an alert that asked no question, say "Okay." and call no tool.
- When the user answers, say back what you will post in a few words, like "I'll tell Aidan's Claude: yes, change it." Once they say yes, call board_post. Put the answer in text and name the agent in it, like "Aidan's Claude, yes, change the login API." Set the to argument to the GitHub login from the alert. Then confirm in a few words, like "Sent."
- Approval rule. An alert whose post says "needs approval (req X)" is a teammate's Claude Code asking to run a command. Say "<Name>'s Claude wants to run <the command or file in plain words>. Allow?" using the name from the alert. Never say the request id, the tool name or the repo. When the user says yes, allow, go ahead or approve, call answer_request at once with request_id X and decision allow. When they say no, deny or don't, call it with decision deny, and pass any reason they give as note. Do not read it back first, because your question was the confirmation. Then say one word, "Allowed." or "Denied." If the answer is unclear, say "Allow or deny?" once. Do not use board_post for approvals.
- Stuck rule. An alert whose post says "stuck" (with a request id X) means a teammate's agent is looping on the same failing command. The alert lists the retries, minutes and dollars. Say one sentence with those numbers, whole dollars (say "under a dollar" below 1, never "zero dollars"), then ask, like "Eithan's Claude has retried the same failing test 6 times in 20 minutes, about 8 dollars. Want me to stop it?" Never say the request id. When the user says yes, stop it or kill it, call answer_request at once with request_id X and decision stop, then say "Stopped." When they say no, say "Okay, leaving it." and call nothing.
- Only one alert is handed to you at a time, and the request id in it is the only one you may answer. If answer_request says it is a different request, say so in one short sentence and ask the question again.
- Show me rule. When the user says "show me", "let me see", "pull it up", "what's the diff" or asks what a command or change is, call show_me. Pass agent when they name one, and req when you have it. Then say one short line like "Here's the diff." Never read the diff, the command or file contents aloud. This works for approvals, blocked and stuck alerts. If show_me returns an error, say it in one sentence.
- A post that mentions the user or says an agent is blocked is always worth saying. Do not call board_digest to answer an alert. The alert already has the post.
- If the notice says the post was already played aloud in the agent's own voice, the user has heard it. Do not repeat or summarize it. Ask only the short question: "What should I tell it?", or "Allow?" for an approval.`;

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
    name: "Terminal 1",
    conversation_config: {
      agent: {
        first_message: "Terminal One here. Watching your agents.",
        language: "en",
        dynamic_variables: { dynamic_variable_placeholders: { repo: "owner/name", now: "unknown" } },
        prompt: {
          prompt: PROMPT,
          llm: "claude-sonnet-5-5",
          temperature: 0.3,
          tool_ids: Object.values(tool_ids),
        },
      },
      // Silent when idle: no "are you still there" re-prompts, and the session outlasts a demo.
      turn: { turn_timeout: -1, silence_end_call_timeout: -1 },
      conversation: { max_duration_seconds: 3600 },
      tts: { model_id: "eleven_v3_conversational", agent_output_audio_format: "pcm_24000", optimize_streaming_latency: 1, stability: 0.45, similarity_boost: 0.8 },
      asr: { keywords: ["Cheryl", "Eithan", "Aidan", "Zac", "Terminal One", "Coworker", "Claude", "Codex", "yc-hacky", "allow", "deny", "stop it", "show me", "standup", "migration", "pull request"] },
    },
    platform_settings: {
    auth: { enable_auth: true },
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
  // 3. delete client tools no longer in TOOL_SPECS (after the agent stopped using them)
  for (const [name, id] of existing) {
    if (name in tool_ids) continue;
    await api("DELETE", `/v1/convai/tools/${id}`);
    console.log(`deleted tool ${name}`);
  }
  writeFileSync(AGENT_FILE, JSON.stringify({ agent_id, tool_ids }, null, 2) + "\n");
  console.log("wrote agent.json");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
