# Proposed fixes (not applied)

Nothing in `scripts/` or app code was changed. Each diff below was tried on a scratch copy of the agent
(`qa/try-fix.ts`, deleted afterwards), never on the live agent. Results are in `qa/results-with-fixes.md`.

| | live agent | with fixes 1 to 3 |
|---|---|---|
| scenario pass | 26/28 | 27/28 |
| voice-safe (at most 3 sentences, no URLs, hashes, markdown, tool names, request ids) | 22/28 | 27/28 |
| first reply, median / p90 | 0.9 s / 3.1 s | 0.8 s / 2.4 s |

## Fix 1: hard cap on spoken length (fixes `digest`, `since-11-repo`, `long-winded`)

The live agent answers digests, commit lists and file reads in 4 to 11 sentences (76 to 154 words), even though the
prompt says "one to three short sentences". The tool results are long (up to 1200 characters) and the agent retells all of it.
This also drives the 2 to 4 s latency on those turns.

`scripts/sync-agent.ts`, PROMPT, "How you talk":

```diff
-- You are speaking out loud. Answer in one to three short sentences.
+- You are speaking out loud. Hard limit: three short sentences and about 40 words, for every answer, including digests, commit lists, files and overviews. Say the headline and the one or two items that matter, never every item. Leave the rest unsaid, the user will ask. Never end an answer by offering more help.
```

The last sentence matters. A first try that said `end with "Want more?"` leaked into unrelated replies
(a repeated "stop it" and an @all mention both grew a third sentence), so those scenarios regressed until it was removed.

Still failing after this fix: `long-winded` run 2, step 2 ("Read me the AGENTS.md file"), 4 sentences instead of 3.
If it matters, add to the `read_file` description in `lib/tool-specs.ts`: `Never read the file aloud. Say what it is for in two sentences.`

## Fix 2: do the "since 11" arithmetic silently (fixes `since-11-repo` talking before its tool call)

In 2 of 6 live runs (three rounds) the agent spoke before calling the tool: "Current time is 12:14 PM, so since 11 is about 2 hours." That is dead air
before the real answer.

```diff
-- For "what happened since 11" style questions, work out how many hours back that is from the current local time, then call recent_activity with that number of hours.
+- For "what happened since 11" style questions, work out silently how many hours back that is from the current local time. Do not say the time or the arithmetic. Call recent_activity with that number of hours.
```

## Fix 3: cap a multi-alert notice (fixes `two-alerts`, intermittent: failed 2 of 6 live runs)

Two alerts in one notice sometimes came back as 4 sentences ("... Which first? Or tell me what to say to Eithan's Codex.").

```diff
-If the notice lists several posts, say one short sentence for each, at most three, then ask.
+If the notice lists several posts, say one short sentence for each, at most three sentences in total, the last one being the question.
```

## Not fixed in the prompt, worth knowing

1. `scripts/text-chat.ts` no longer connects. Since `platform_settings.auth.enable_auth` was turned on
   (commit 6aa5985) it fails with "This agent requires authorization to access." because it passes a bare `agentId`.
   `qa/run.ts` mints a signed URL instead (`GET /v1/convai/conversation/get-signed-url`). Minimal change for text-chat:
   fetch `${BASE}/api/convai-token?text=1` and pass `signedUrl` (with `textOnly: true, connectionType: "websocket"`) to `Conversation.startSession`
   in place of `agentId`. That route is limited to 10 per minute per client.
2. Plain `@all` mention with nothing to answer: the user says "No, that's fine" and the agent replies
   "I'll tell Aidan's Claude: no problem, go ahead with the merge. Should I send that?". It asks before posting, so nothing is
   sent, but it invents a relay. One line in the prompt would stop it:
   `If the user says no, fine or nothing to an alert that asked no question, say "Okay." and call no tool.`
   Untested, so it is not part of the table above.
3. The `write` rate limit (10 per minute per client, `lib/ratelimit.ts`) is fine for one person talking but a parallel
   test run shares one bucket. `qa/run.ts --concurrency 3` stayed under it.
