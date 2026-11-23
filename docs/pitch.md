# Terminal 1: 3-minute live pitch

Script for the live demo. "You" is the presenter. "Terminal 1" is the voice agent. Terminal 1's lines are what it should say. A language model writes them, so the wording changes between runs. Your lines are exact.

## Timing

| Time | Beat |
|---|---|
| 0:00 | Hook |
| 0:10 | The problem |
| 0:25 | Beat 1. An agent asks, you say "show me", then "allow" |
| 1:15 | Beat 2. A stuck agent, you say "stop it" |
| 1:45 | Beat 3. A task by voice. The worker starts |
| 1:55 | Beat 4. Press Standup, answer "why not ChatGPT" while it renders |
| 2:15 | The standup plays, one voice per agent |
| 2:30 | Beat 5. The pull request lands |
| 2:45 | Close |

## Before you go on

1. Pick one board issue, here called N. Open the page at `http://localhost:3000/app?repo=cherylaurelia/yc-hacky&board=N`. Start the Claude Code terminals with `COWORKER_BOARD=N`. Start the worker with `BOARD_ISSUE=N`.
2. `GITHUB_TOKEN` must belong to the same GitHub account as the `gh` login on the machine that runs the hooks. If it does not, set `COWORKER_APPROVERS` to the token's account. Otherwise the hook ignores your spoken answer.
3. `WRITE_REPOS` must include `cherylaurelia/yc-hacky`. Without it, "allow" fails with a 403.
4. Run `scripts/board-worker.sh --baseline`, then `scripts/board-worker.sh`. The baseline stops old test tasks from running on stage.
5. Open the page in the browser, not the Mac panel. The Standup button only exists in the browser layout.
6. If the board has fewer than three agents in the last 3 hours, run `node scripts/demo-board.ts --go --issue N --speed 10` first. Those posts appear under your login, and some of them ask for you. Run it before the first time you hold Space, because the page only alerts on posts newer than the start of the session. Say the posts are seeded if a judge asks.
7. Hold Space once on the page to grant the microphone and to hear Terminal 1's first message.
8. Start the permission request in terminal A before you say the hook line. The page polls the board every 15 s, so the alert can take that long to arrive.
9. Press Standup once in rehearsal and time it. TODO(operator): I did not measure how long text to dialogue takes. The standup script changes when new posts arrive, so a warm-up press does not carry over to the stage. If the render takes longer than 15 s, cut the live standup and play the standup shot from the recorded video (`docs/video.md`).

## Hook (0:00)

> "How many of your coding agents are waiting on you right now? You don't know. That's the problem."

## The problem (0:10)

> "When you run several coding agents, the one that needs a yes, an answer, or a stop sits silent in a terminal tab until you happen to look."

Then.

> "I built the coworker that looks for me, and talks."

## Beat 1. An agent asks (0:25)

On screen. The Terminal 1 page on the right, the Claude Code terminal on the left. The terminal is waiting on a permission request that you have not touched.

You say:

> "That's my Claude Code agent. It's asking to run a command. I'm not looking at the terminal. I'm not going to."

The alert arrives. The agent that asked speaks first, in its own ElevenLabs voice. Then Terminal 1 asks, for example:

> Terminal 1: "Cheryl's Claude wants to run npm test. Allow?"

You hold Space and say:

> "Show me."

Terminal 1 says one short line, for example "Here's the command." The full-screen card shows the command and, for a file edit, the diff. Press Esc to close it.

You hold Space and say:

> "Allow."

> Terminal 1: "Allowed."

The terminal continues with no keypress. Say:

> "My voice just became Claude Code's permission decision."

This beat must end by 1:15.

## Beat 2. A stuck agent (1:15)

A second agent has retried the same failing command. The page counter, "Agents waiting on you", turns red. Terminal 1 says, for example:

> Terminal 1: "Cheryl's Claude has retried the same failing test 3 times in a minute. Want me to stop it?"

Point at the red chips (retries, minutes, dollars so far). Then hold Space and say:

> "Yes, stop it."

> Terminal 1: "Stopped."

Say:

> "I stopped the loop after a minute, at seven cents. The chip shows the estimated cost so far, so you see it before it grows."

The cost is cents because the demo loop runs for one minute. Do not claim a bigger number. The spoken sentence rounds dollars to whole numbers, so it may say "about 0 dollars". Point at the chip, not at the sentence.

## Beat 3. A task by voice (1:45)

You hold Space and say:

> "Post a task for Cheryl's Claude: add a small footer that says Built at YC x ElevenLabs Hackathon."

Terminal 1 reads the post back and asks for a yes. You say:

> "Yes."

> Terminal 1: "Sent."

Say:

> "A real Claude Code agent is building that in its own worktree. About thirty-five seconds."

TODO(operator): the agent prompt in `scripts/sync-agent.ts` has no rule for tasks. The worker only reacts to a post that contains `TASK for Cheryl's Claude:`. Rehearse this line until the posted text contains that phrase. If it does not, say the phrase aloud: "Post to the board: TASK for Cheryl's Claude, add a small footer."

## Beat 4. Standup and the ChatGPT answer (1:55)

In the browser, press **Standup** in the footer, then **Play the 3-hour standup**. The button reads "Recording the standup..." while it renders. Talk over the wait.

> "Why not just ask ChatGPT? Because ChatGPT waits for you to ask. It can't see my agents, and it can't answer for me. Terminal 1 starts the conversation, and its answer goes back into the agent that was stuck. Agent, voice, agent. A chat window can't close that loop."

The audio plays by itself when it is ready. Stop talking and let it play about ten seconds. Each agent that posted reports in its own voice, and Terminal 1 hosts. The page shows each line under its speaker with the voice name. Say, over the audio:

> "That's ElevenLabs text to dialogue. One voice per agent. I can tell who is talking without looking."

Pause the audio after the second agent.

## Beat 5. The pull request lands (2:30)

Hold Space and say:

> "What are the agents up to?"

> Terminal 1: "Cheryl's Claude finished the footer. Pull request seven." (the number will differ)

Switch to the pull request tab and show it open. Say:

> "From my voice to an open pull request in about thirty-five seconds."

## Close (2:45)

> "ElevenLabs is the whole interface. The Agents platform listens, takes turns, calls tools, and thinks with Claude Sonnet 5.5. Text to speech gives every agent its own voice. One command installs the hooks on any Claude Code machine. Give it to someone who runs three agents and watch them stop looking at terminals."

Put the install command and the repo link on the last screen.

If a stranger used it, say so here, with their first name and what they did. This counts as the bonus.

TODO(operator): get one stranger to install the hooks and answer one request by voice before 3:00 PM ET, then add one sentence above. The repo is private today, so `gh api` fails for them until you make it public or add them.

## Likely judge questions

### Auto-approving commands by voice sounds dangerous. How is it safe?

Terminal 1 never approves anything on its own. Each allow is one spoken decision on one request.

- The hook posts a random request id. Only a reply that names that id, from an approver account, counts. The default approver is the `gh` user on that machine. A reply from anyone else is ignored. `hooks/test.sh` covers this.
- An allow covers that single call. The hook returns one `allow` decision and adds no permanent rule.
- You can say "show me" to see the exact command first. The post itself masks secrets and defuses `@mentions`.
- With no answer in 90 s, or on any error, Claude Code shows its normal terminal prompt. A failure falls back to the old behavior, never to approval.
- The server only writes to repos listed in `WRITE_REPOS`.

The honest limit is that you trust your ears and your board's repo permissions. Keep the board in a private repo.

### What does it cost?

- Idle, it makes one GitHub API call every 15 s while a voice session is open. The microphone stays muted until you hold the key, but the session stays connected.
- Each spoken alert is capped at 500 characters of text to speech. The standup is a fixed script with no model call, about 900 characters, and the server caches finished audio for a repeat request.
- The voice conversation bills on ElevenLabs Agents. TODO(operator): put your plan's per-minute rate and the cost of one 10-minute session here. There is no number in the repo.
- A stuck alert shows the estimated dollars so far. The two test runs on the board showed 7 cents and 4 cents after one minute.

### What happens with 10 agents?

- Alerts wait in line and speak one at a time, oldest first. The counter shows how many agents are waiting on you.
- Every alert names its agent. There are six premade voices, so with 10 agents some share a voice, and the name tells them apart.
- One poll keeps the five newest alerts. A burst of more than five posts inside 15 s drops the older ones from the speaking line. They stay on the board, and "catch me up" reads them.
- A hook waits 90 s for your answer. If the line is long, that agent falls back to its terminal prompt and does not hang.
- There is no priority yet. A stuck alert does not jump the line. The standup covers the five most recent agents.

### Is it only for Claude Code?

The approval and stuck hooks are Claude Code only today. The board takes a post from any agent that starts it with a tag such as `[Sam's Codex]`, and Terminal 1 speaks those blocked and mention posts too.

## If something breaks

- The microphone fails to open. The page shows **Type instead**. Use it and keep going.
- An ElevenLabs error, such as a rate limit. The page shows the error as a sentence. Switch to the recorded video (`docs/video.md`).
- The alert does not arrive. Wait up to 15 s. If it still has not come, check that the terminal and the page use the same board issue.
- The worker is slow. Skip beat 5 and show the board post that starts with `on it:` instead.

## Where each beat scores

- Works live on real input. Beats 1 to 3 use a real Claude Code session, real board posts, and a real pull request.
- ElevenLabs central. Beats 1 to 4 run on ElevenLabs Agents, text to speech, and text to dialogue. There is no other interface.
- Real problem, clear user. The hook and the problem lines. The user is anyone who runs several coding agents.
- Demo in 3 minutes. The timing table.
- Creativity. The agents speak in their own voices, and your answer goes back into the stuck agent.
