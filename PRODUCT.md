# Product

<!-- impeccable:product-schema 1 -->

Written from the operator's brief of 2026-11-22 (no interview round: written by a delegate agent with no question tool). Facts below come from that brief and the code in this repo.

## Platform

web

The same page also renders inside a native Mac menu-bar panel (`?embed=1`, 360x520).

## Users

People who run several AI coding agents at once (Claude Code, Codex) across a small team. They are at their desk, in another window, doing their own work, and do not want to babysit terminals. The job: notice when an agent needs a human, answer it fast, and get back to what they were doing.

## Product Purpose

Terminal 1 (formerly Coworker) is a voice coworker for a team's coding agents. It watches the agents (a pinned GitHub-issue board plus Claude Code hooks) and speaks up when one is blocked, needs approval to run a command, or is stuck retrying the same failing thing. The person holds a key and answers by voice; Terminal 1 relays the answer, approves or denies the command, or stops the agent. Success: no agent waits long on a human, and the human never has to go looking.

## Positioning

It interrupts you only when an agent needs you, and you answer without leaving what you are doing: hold a key, say "allow" or "stop it", let go. Each agent has its own voice, so you know who is talking before you look.

## Operating Context

- Talk key: Space in the browser; Right Option (default when Wispr Flow is installed) or fn in the Mac menu-bar app.
- Board: a pinned GitHub issue where agents post `[Name's Agent] text`; Claude Code hooks post `needs approval`, `blocked`, `done`.
- Voices: ElevenLabs. Coworker speaks as "Eric"; each poster gets a stable premade voice (Roger, Sarah, Charlie, Alice, George, Jessica).
- Standup: a 60-second multi-voice audio standup where each agent speaks in its own voice.
- "Show me" brings up the exact command or diff behind an alert.
- First real showing: a YC hackathon demo on a laptop or projector, about 3 minutes.

## Capabilities and Constraints

- Voice states: idle, listening, thinking, speaking. The Mac menu-bar icon follows the same state.
- Agent states shown: working, blocked, needs approval, stuck, done.
- Stuck detection reports repeat count, minutes, and an estimated dollar cost.
- Alert actions: Allow, Deny, Stop, also available by voice. Alerts queue; one plays at a time.
- Stack: Next.js 16, React 19, Tailwind 4, `@elevenlabs/react`.
- Undecided: cost figures are estimates; there is no billing integration.

## Brand Commitments

- Name: Terminal 1 (renamed from Coworker on 2026-11-23; "Coworker" survives only in internal names, the `coworker` CLI and ~/.coworker paths agents depend on).
- Reference feel named by the operator: Wispr Flow (a tiny unobtrusive pill, live waveform while the key is held, calm, premium, gets out of the way). This sets the craft bar, not a look to copy.
- The previous UI (big empty dark canvas, a large "Idle" box) was rejected and is an anti-reference.

## Evidence on Hand

- Real team agents: Aidan's, Eithan's, and Cheryl's Claude/Codex (see AGENTS.md). Demo data may add a fourth teammate; label it as demo data.
- No customers, usage numbers, or pricing exist. Do not invent them.

## Product Principles

1. Speak only when a human is needed; silence is the default state.
2. Answering must take one key and one sentence.
3. Who is talking is always obvious, by voice and on screen.
4. Show the exact thing being approved (the command, the diff) before anyone says yes.
5. Waiting has a cost; show it in minutes and dollars when an agent is stuck.

## Accessibility & Inclusion

Every voice action has an on-screen button equivalent. Spoken alerts also appear as text in the transcript.
