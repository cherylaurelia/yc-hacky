# Live demo runbook (3 minutes)

Goal: judges watch real Claude Code sessions need us, and Coworker gets us unblocked by voice. Everything below is real input. Nothing is mocked except the three tiny repos.

`demo/run.sh --board 1` starts three real sessions in tmux (session `coworker-demo`):

| Window | Repo | Prompt makes it | Board post | Lands at |
|---|---|---|---|---|
| Eithan's Claude | demo-storefront | edit `db/schema.sql`, run `npm run migrate` (not allowlisted) | `needs approval (req ID): Bash npm run migrate` | +8 to 12 s |
| Aidan's Claude | demo-payments-api | re-run a flaky `npm test` that fails 10 times | `stuck: retried npm test ...` (needs the stuck detector, see below) | +30 to 40 s |
| Cheryl's Codex | demo-docs-site | run a 64 s index rebuild | `done: ...` (turn over 60 s) | +70 to 75 s |

The Coworker app polls the board every 15 s, so each alert is spoken up to 15 s after its post.

## Before the judges arrive (T-15 min)

1. `gh auth status` is logged in as the approver (the hook only accepts replies from that login). `tmux -V`, `claude --version` work.
2. Rehearse once on the scratch board, then clean it. Never rehearse on `--board 1`.
   ```
   demo/run.sh --auto-approve        # board 4, answers the approval itself, prints every post with its time
   demo/reset.sh                     # kills tmux, deletes the scratch repos and the demo's comments, lists them
   ```
3. Start the app: `npm run dev`, open `http://localhost:3000/app?repo=cherylaurelia/yc-hacky&board=1`. Click start, check the mic meter moves. Mac app: hold Right Option (or the key you configured) instead of Space.
4. Voice to PR: `scripts/board-worker.sh --baseline`, then in its own terminal `BOARD_ISSUE=1 scripts/board-worker.sh`. (Rehearse with `BOARD_ISSUE=4 WORKER_PR_PREFIX='[demo] '`.)
5. Standup fallback, recorded while the dev server is up and the board has posts (after a rehearsal run, before reset):
   ```
   curl -sS -o demo/standup.mp3 'http://localhost:3000/api/standup?repo=cherylaurelia/yc-hacky&board=4&hours=3'; afplay demo/standup.mp3
   ```
   Do not commit it. Keep it in `demo/standup.mp3` on this Mac.
6. Two terminal windows side by side with the app: one empty (for `demo/run.sh`), one that will run `tmux attach -t coworker-demo` (`Ctrl-b n` switches windows).

## The 3 minutes

`t=0` is when you press Enter on `demo/run.sh --board 1`. Say first, then run it.

| Time | You say | You hold the key and say | What appears |
|---|---|---|---|
| 0:00 to 0:20 | "Three Claude Code agents are about to work on three repos. I'm not watching any of them. Coworker is." Run `demo/run.sh --board 1`. | Hold: "Tell Cheryl's Claude to add a line saying built live at the hackathon to the footer." Release, then "yes" to the read-back. | Terminal lists three windows started, then prints each board post with its time. Worker terminal logs `on it`. |
| 0:20 to 0:50 | "First one needs me." | When Coworker speaks (Eithan's voice, then the question): hold: "Show me." Release, look. Hold: "Yes, allow it." | Focus card with the `db/schema.sql` diff. Coworker says "Allowed." Within about 3 s Eithan's window shows `Allowed by PermissionRequest hook` and prints the migration result. |
| 0:50 to 1:25 | "Second one is stuck retrying the same test. A human would not notice for twenty minutes." | Hold: "Yes, stop it." | Red "Stuck in a loop" card with retries, minutes and cost. Coworker says "stop" and the board shows `req ID stop`. Needs the stuck detector. If it has not landed, skip this row and say "and it would catch retry loops here". |
| 1:25 to 1:50 | "Third one just finished a long job." | Hold: "Catch me up." | Cheryl's voice reads `done: ... 128 pages`. Coworker gives a short digest. |
| 1:50 to 2:30 | "Now a standup, from what the agents actually posted." | Hold: "Give me a standup." | A multi-voice standup (Coworker plus one voice per agent) plays for about 30 s. |
| 2:30 to 3:00 | "And the one I asked for at the start." Show the worker terminal. | none | Worker posts `[Cheryl's Claude] done: ..., PR #N`. Open the PR. If it is not there yet, show `on it` and the PR from rehearsal. |

After the demo: `demo/reset.sh`. It prints every comment it deletes. On `--board 1` it deletes only posts that name a demo repo or reply to one, created after the run started. Teammates' posts stay.

## If something fails

| Failure | Do this |
|---|---|
| Wifi down or GitHub unreachable | `demo/run.sh` stops in preflight with the reason. Join the phone hotspot and rerun. Without GitHub the hooks stay silent and Claude shows its normal terminal prompts, so there is no board to talk to: play the standup mp3 (`afplay demo/standup.mp3`) and narrate over the tmux windows. |
| Mic or ElevenLabs fails | The red banner shows **Type instead**. Click it and type the same sentences ("show me", "yes allow it", "yes stop it", "catch me up", "give me a standup"). Typing uses the same tools. |
| Standup audio fails | `afplay demo/standup.mp3`. |
| Approval spoken too late (the hook waits 90 s) | Eithan's window falls back to Claude's normal prompt. Press Enter on `1. Yes` there. |
| Voice answer was not heard but you can read the req id | `gh api repos/cherylaurelia/yc-hacky/issues/1/comments -f body="req ID allow"` |
| A session is slow or dead | `demo/reset.sh && demo/run.sh --board 1` takes about 8 s to relaunch. Start it before you start talking if you are unsure. |
| `demo/run.sh` says reset first | The last run is still up. `demo/reset.sh`. |

## Notes

- `demo/run.sh --help` lists every flag. `--attach` drops you straight into tmux. `--stuck on` forces the retry session even without a stuck detector (it then retries but posts nothing).
- The sessions run Sonnet with `acceptEdits`. Edits are auto-approved, so the only approval is `npm run migrate`. The idle-prompt hook is removed from the scratch repos, otherwise each finished session would post `blocked: waiting for input` a minute later and break the order (`--keep-idle` keeps it).
- Hooks are installed project-locally in the scratch repos (`hooks/install.sh --project`). Nothing under `~/.claude` changes.
- `COWORKER_BOARD` in your shell is ignored by `demo/run.sh`; only `--board` counts, so a rehearsal cannot hit board 1 by accident.
- The voice phrases above depend on the ElevenLabs agent's prompt, which is not in this repo. Say each one once in rehearsal and adjust the wording.
