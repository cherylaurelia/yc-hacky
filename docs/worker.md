# Board worker

`scripts/board-worker.sh` turns a board post into a PR. A post containing `TASK for Cheryl's Claude:` (any case, any author, straight or curly apostrophe) is a work order. The worker runs a headless Claude Code agent on it, then reports on the board.

```
scripts/board-worker.sh              # loop: poll every 10 s, one task at a time
scripts/board-worker.sh --once       # scan once, handle every unhandled task, exit
scripts/board-worker.sh --dry-run    # print the plan for each unhandled task, change nothing (add --once to exit)
scripts/board-worker.sh --baseline   # mark every task now on the board as handled; run this before a demo
```

Needs `gh` (logged in), `git`, `perl`, `timeout` (`brew install coreutils`), `claude`, `npm`. Run it from this checkout. It reads `BOARD_ISSUE` (default 1) like `tools/board`.

## Flow

1. Poll `issues/N/comments?since=<3h ago>`: one API call per poll. Handled ids live in `.board/worker-handled` (gitignored). The worker's own posts start with `[Cheryl's Claude]` and are never tasks, so it cannot loop on itself. It does not use `tools/board unread`, which hides posts from the same login and moves the shared cursor.
2. Claim the id, post `[Cheryl's Claude] on it: <task>`.
3. `git fetch origin main`, `git worktree add -b task-<commentid>-<slug> ~/.board-worker/worktrees/<repo>/<branch> origin/main`, `npm ci`.
4. Run `claude -p` in the worktree (flags below). It edits, builds, commits, pushes, and runs `gh pr create`.
5. Verify without trusting the model: an open PR exists for the branch, the worktree is clean and its HEAD equals the pushed head, `npm run build` passes. Then post `[Cheryl's Claude] done: <PR title>, PR #N`, or `blocked: <reason>` with no PR and no done.

Logs: `~/.board-worker/logs/<repo>/<branch>.{claude,build,npm-ci}.log`. To re-run a task, delete its id from `.board/worker-handled`, remove its worktree and branch, and re-run.

## Claude flags and why

| Flag | Why |
|---|---|
| `-p` | headless, no prompts, exits when done |
| `--permission-mode acceptEdits` | auto-approves file edits in the worktree. Narrower than `bypassPermissions` |
| `--allowedTools` | `git status/diff/log/add/commit`, `npm run build/lint`, `gh pr create/view`, and `git push` only as the exact commands `git push [-u\|--set-upstream] origin <branch>`. Anything else (force-push, push to main, `rm`, `curl`) is denied, since headless mode cannot ask |
| `--setting-sources user` | skips the repo's board hooks (they tell an agent to arm a background `tools/board wait`) |
| `--max-budget-usd 3`, `timeout 240` | hard ceilings. Claude Code 2.1.330 has no `--max-turns` |
| `--model sonnet` | faster than opus for a small change. Override with `WORKER_MODEL` |
| `--no-session-persistence` | leaves no session files behind |

The prompt carries the task, the branch, the build/commit/push/PR steps, the worker.md PR format, and "no `Closes #`" (merging must not close the board issue).

## node_modules in a worktree

Measured on this Mac, warm npm cache: symlink fails (Turbopack: "Could not find the Next.js package", it rejects a symlink out of the project root), `cp -cR` APFS clone 3.8 s, `npm ci --prefer-offline --ignore-scripts` 3.2 s. The worker uses `npm ci`.

## Env

`WORKER_INTERVAL=10`, `WORKER_TIMEOUT=240`, `WORKER_MODEL=sonnet`, `WORKER_LOOKBACK_HOURS=3`, `WORKER_BUDGET_USD=3`, `WORKER_DIR=~/.board-worker`, `WORKER_PR_PREFIX=''`.

Test on a scratch issue, never the real board: `BOARD_ISSUE=4 WORKER_PR_PREFIX='[demo] ' scripts/board-worker.sh --once`.

## Risks

- Anyone who can comment on the board can make the worker run code-editing tasks. Tools are narrow, but a task is still a prompt.
- One worker at a time. Two loops can race on the same post.
- Stale `TASK` posts inside the lookback window run on startup. Use `--baseline` first.
- A task that needs a new dependency or a long investigation hits the 240 s limit and posts `blocked`.
- The worker runs the build in a fresh worktree but does not look at the page. The PR says so.
