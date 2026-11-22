# Coworker: 2-minute demo video

Shot list for the submission video. The limit is 2:00, so plan for 1:58. "VO" is voiceover you record. "APP" is audio the product makes. "YOU" is you talking to Coworker on screen. APP lines vary between runs, so keep the take that sounds best.

## Shot list

| Time | On screen | Audio |
|---|---|---|
| 0:00 to 0:07 | Three terminal tabs. One shows a Claude Code permission prompt and nobody touches it. Caption "Agents wait in silence." | VO: "Right now, one of your coding agents is waiting on a prompt you haven't seen." |
| 0:07 to 0:14 | Cut to the Coworker page in its idle state. Lower third "Coworker, a voice coworker for people who run several AI agents." | VO: "Coworker watches your agents and speaks up when one needs you." |
| 0:14 to 0:22 | Split screen. The terminal asks to run a command. The alert card "Blocked, needs you" appears in the Coworker activity list. | APP: the agent that asked reads its post in its own ElevenLabs voice. No VO. |
| 0:22 to 0:30 | Coworker's state label shows speaking. Burn in a caption of its line. | APP: "Cheryl's Claude wants to run npm test. Allow?" |
| 0:30 to 0:38 | Show a "Space" key overlay as you hold it. The full-screen card opens with the command and diff. | YOU: "Show me." APP: "Here's the command." |
| 0:38 to 0:48 | Press Esc. Hold Space again. Cut to the terminal. Claude Code continues with no keypress. | YOU: "Allow." APP: "Allowed." Then VO: "My voice is Claude Code's permission decision." |
| 0:48 to 1:08 | The "Agents waiting on you" counter turns red. Zoom on the chips, for example "3 retries, 1 min, $0.07". | APP: Coworker says the retries and asks to stop it. YOU: "Yes, stop it." APP: "Stopped." Then VO: "Stuck in a retry loop? It shows the cost so far, and I stop it." |
| 1:08 to 1:30 | Hold Space. Caption the task. Cut to the board: `on it:` then `done:` with a pull request number. A timer overlay runs from the `on it:` post. End on the open pull request. Speed up the wait. | YOU: "Post a task for Cheryl's Claude: add a small footer that says Built at YC x ElevenLabs Hackathon." APP: "Sent." VO: "A real Claude Code agent builds it in its own worktree and opens a pull request. [N] seconds, timed on screen." |
| 1:30 to 1:48 | Browser. Press Standup. Captions show each speaker with its voice name. | APP: about ten seconds of the standup, each agent in a different voice. VO over the last two seconds: "Every agent has its own voice." |
| 1:48 to 1:58 | Last screen. The install command, the repo link, and the line "ElevenLabs Agents, text to speech, text to dialogue." | VO: "One command installs the hooks. ElevenLabs is the whole interface." |

## Rules for the take

- Record real runs. Do not edit a response in. You may cut the waiting time, and the timer overlay must show the real elapsed time.
- If the board posts for the standup came from `scripts/demo-board.ts`, put the caption "seeded demo posts" on those shots.
- Record system audio and your microphone on separate tracks, so the voiceover never fights with Coworker's voice.
- Burn in captions for every APP line. A judge may watch with the sound off.
- Export 1920 by 1080, with the file under the submission size limit. TODO(operator): check the upload limit on the submission form.
- If the cut runs over 2:00, drop the standup first, then the "Show me" shot.

## Before you record

- The same setup as the live pitch applies. See "Before you go on" in [pitch.md](pitch.md). Use the browser page, because the Standup button is not in the Mac panel.
- Start the stuck loop in a scratch repo with a failing test, so the retries are real.
- Run `scripts/board-worker.sh --baseline` and then `scripts/board-worker.sh`, so the task is the only one it picks up.

## TODO for the operator

- Replace `[N]` with the number of seconds on your timer.
- Cut the 20-second GIF for `docs/demo.gif` from the 0:22 to 0:42 shots (Coworker asks, "Show me", "Allow"). The README links it.
- TODO: the stuck-loop shot needs the hook update that posts the retry chips. It is not on main yet.
