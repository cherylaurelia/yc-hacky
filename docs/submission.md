# Submission fields

Paste each field as written. Items marked TODO need you before you submit at 3:00 PM ET.

## Project name

Terminal 1

## One-liner

A voice coworker that watches your AI coding agents and interrupts you when one needs approval, is blocked, or is stuck retrying a failing command.

## Description

Terminal 1 is a voice coworker for people who run several AI coding agents. Claude Code hooks and a shared GitHub issue board tell it what every agent is doing. When one needs approval, is blocked, or is stuck retrying a failing command, Terminal 1 speaks up. The agent that asked talks first in its own ElevenLabs voice, then Terminal 1 asks you. You hold a key and say allow, deny, stop, or an answer to relay. Say "show me" and the command or diff opens on screen. Give a task by voice and a headless Claude Code agent opens a pull request in about 35 seconds on a small change. A standup button plays each agent's latest news in its own voice. ElevenLabs Agents handles speech, turn-taking, tool calls, and the Claude Sonnet 5.5 brain. Text to speech and text to dialogue give each agent a voice.

## Partner tools

| Tool | How Terminal 1 uses it |
|---|---|
| ElevenLabs Agents platform | The whole conversation. It handles speech in, speech out, and turn-taking. Its agent runs `claude-sonnet-5-5` and calls 12 client tools. Eleven read and write the GitHub repo and the agent board through the server, and one puts a card on screen. The page connects with `@elevenlabs/react`. Setup is in `scripts/sync-agent.ts`. |
| ElevenLabs text to speech (`eleven_flash_v2_5`) | Reads each agent's board post in that agent's own voice, from a pool of six premade voices. Route `app/api/speak`. |
| ElevenLabs text to dialogue (`eleven_v3`) | Records the multi-voice standup, one voice per agent and a host. It falls back to one text to speech clip per line when dialogue is unavailable. Route `app/api/standup`. |

TODO(operator): Codevisor. Add a row only if you used it during the build or the demo, and say how. I found no use of it in the code.

TODO(operator): the repo has the cubic review bot, which commented on PR 6. If cubic is a hackathon partner and you used it, add a row.

Other tools, not necessarily partners.

- Claude Code runs the hooks (`hooks/coworker-hook.sh`) and the headless board worker (`scripts/board-worker.sh`).
- GitHub issues and the GitHub API are the agent board.
- Next.js 16, React 19, and Tailwind build the page. A Swift menu-bar app (`macos/`) holds the talk key.

## Links

- Project: https://github.com/cherylaurelia/yc-hacky
- Demo video: TODO(operator) record the video from `docs/video.md`, upload it, and paste the link.
- Live demo: https://40984690-ad84-41e4-86fe-718bb67011bb.mtm.sh (hosted on Maritime)
- Try it: the README has the one-command hook install and the local run steps.


## Team

TODO(operator): confirm names. `AGENTS.md` lists Cheryl (`cherylaurelia`), `EithanY-Coder`, `aidanyee17`, and a fourth member to be named.

## Stranger bonus

TODO(operator): get one person who is not on the team to install the hooks and answer one request by voice. Then write one sentence here, with their first name and what they did.

## Before you submit

1. The hook update that posts stuck loops, handles "stop", and adds the diff context is on main. The description and the video rely on it. At the time of writing, `hooks/coworker-hook.sh` on main has none of these.
2. The repo is public, or the judges can read it.
3. The video is 2:00 or shorter and uploaded.
4. `docs/demo.gif` exists, or the README line that links it is removed.
5. The voice task flow works end to end. The agent prompt has no rule for tasks, so rehearse the phrase in [pitch.md](pitch.md).
