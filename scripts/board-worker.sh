#!/usr/bin/env bash
# Board worker: turns a `TASK for Cheryl's Claude:` board post into a PR with a headless Claude Code run.
# Usage: scripts/board-worker.sh [--once] [--dry-run] [--baseline]      (docs/worker.md)
#   (no flags)  loop: poll the board every WORKER_INTERVAL seconds, handle new tasks one at a time
#   --once      scan once, handle every unhandled task, exit
#   --dry-run   print the plan for each unhandled task; no worktree, no claude, no posts, nothing marked handled
#   --baseline  mark every task currently on the board as handled (run before a demo to skip stale tests)
# Env: WORKER_INTERVAL=10  WORKER_TIMEOUT=240 (claude, seconds)  WORKER_MODEL=sonnet  WORKER_LOOKBACK_HOURS=3
#      WORKER_BUDGET_USD=3  WORKER_DIR=~/.board-worker  BOARD_ISSUE=1  BOARD_REPO=owner/name
#      WORKER_PR_PREFIX='' (e.g. '[demo] ' puts that before every PR title; use for tests; test on BOARD_ISSUE=4, never the real board)
set -u

ONCE=0; DRY=0; BASELINE=0
for a in "$@"; do
  case "$a" in
    --once) ONCE=1 ;;
    --dry-run) DRY=1 ;;
    --baseline) BASELINE=1; ONCE=1 ;;
    -h|--help) sed -n "2,11p" "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "board-worker: unknown arg $a (try --help)" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOARD="$ROOT/tools/board"
ISSUE="${BOARD_ISSUE:-1}"
INTERVAL="${WORKER_INTERVAL:-10}"
TIMEOUT_S="${WORKER_TIMEOUT:-240}"
MODEL="${WORKER_MODEL:-sonnet}"
LOOKBACK_H="${WORKER_LOOKBACK_HOURS:-3}"
BUDGET="${WORKER_BUDGET_USD:-3}"
PR_PREFIX="${WORKER_PR_PREFIX:-}"
WORKER_DIR="${WORKER_DIR:-$HOME/.board-worker}"
STATE="$ROOT/.board"                      # gitignored
HANDLED="$STATE/worker-handled"           # one comment id per line
ME="[Cheryl's Claude]"                    # prefix of every post the worker makes

log() { printf '%s [worker] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { log "$*"; exit 1; }
case "$INTERVAL$TIMEOUT_S$LOOKBACK_H" in *[!0-9]*|'') die "WORKER_INTERVAL/TIMEOUT/LOOKBACK_HOURS must be whole numbers" ;; esac
for c in gh git perl timeout; do command -v "$c" >/dev/null 2>&1 || die "$c not found (macOS: brew install gh coreutils)"; done
[ "$DRY$BASELINE" != "00" ] || command -v claude >/dev/null 2>&1 || die "claude CLI not found"
[ -x "$BOARD" ] || die "missing $BOARD"
cd "$ROOT" || die "cannot cd to $ROOT"
mkdir -p "$STATE" || die "cannot create $STATE"
touch "$HANDLED" || die "cannot write $HANDLED"

REPO="${BOARD_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)}"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "cannot determine repo; set BOARD_REPO=owner/name"
export BOARD_REPO="$REPO"
export BOARD_WAIT=off   # headless claude must not arm a background `tools/board wait`

b64d() { base64 -d 2>/dev/null || base64 -D; }
iso_ago() { date -u -v-"$1"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "$1 hours ago" +%Y-%m-%dT%H:%M:%SZ; }

# Rows: id<TAB>login<TAB>base64(body), comments updated in the lookback window. Non-zero on gh failure.
fetch() {
  gh api --paginate "repos/$REPO/issues/$ISSUE/comments?per_page=100&since=$(iso_ago "$LOOKBACK_H")" \
    --jq '.[] | "\(.id)\t\(.user.login)\t\(.body | @base64)"' 2>/dev/null
}

# stdin: post body. Prints the task text if the post is a task for this worker, else nothing.
# A task contains `TASK for Cheryl's Claude:` (any case, straight or curly apostrophe) and is not one of the worker's own posts.
task_text() {
  perl -0777 -ne 'exit if /\A\s*\[Cheryl(?:\x27|\xe2\x80\x99)s Claude\]/i;
                  print $1 if /TASK for Cheryl(?:\x27|\xe2\x80\x99)s Claude:[ \t]*(.*)/is' |
    perl -0777 -pe 's/\s+\z//'
}

post() { # retry transient gh failures
  local i out
  for i in 1 2 3; do
    out="$("$BOARD" post "$1" 2>&1)" && return 0
    log "board post failed (try $i/3): $out"; sleep 2
  done
  return 1
}

block() { log "blocked: $1"; post "$ME blocked: $1" || log "could not post the blocked message"; }

allowed_tools() { # tools claude may use without a prompt; everything else is denied in headless mode
  printf '%s\n' "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git add:*)" "Bash(git commit:*)" \
    "Bash(npm run build:*)" "Bash(npm run lint:*)" "Bash(gh pr create:*)" "Bash(gh pr view:*)" \
    "Bash(git push -u origin $1)" "Bash(git push origin $1)" "Bash(git push --set-upstream origin $1)"
}

handle() { # $1=comment id  $2=author  $3=task text
  local id="$1" author="$2" task="$3" slug branch wt oneline t0 t prompt rc pr pr_num pr_title head remote logs
  slug="$(printf '%s' "$task" | head -n 1 | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '-' | cut -c1-30 | sed 's/^-*//; s/-*$//')"
  branch="task-$id-${slug:-task}"
  wt="$WORKER_DIR/worktrees/$REPO/$branch"
  logs="$WORKER_DIR/logs/$REPO/$branch"   # outside the worktree so claude cannot commit them
  oneline="$(printf '%s' "$task" | tr '\n' ' ' | cut -c1-200)"
  prompt="You are Cheryl's Claude, an autonomous worker. A teammate posted this task on the team board:

$task

Context: you are in a fresh git worktree on branch $branch (cut from origin/main), node_modules installed. Stay in this directory. You have about $((TIMEOUT_S / 60)) minutes, so be quick.
Follow AGENTS.md section 3 (Workflow) with these overrides: the branch name is fixed (above), and the PR body must not contain 'Closes #' or any closing keyword (the board is issue #$ISSUE and must stay open). Do not use tools/board; the worker posts to the board.
Steps:
1. Make the smallest change that does the task. Reuse existing components and styles. Touch only what the task needs.
2. Run 'npm run build'. Fix any failure your change caused.
3. Stage only the files you changed and commit: 'type(scope): subject', end the message with the line 'Co-Authored-By: Claude <noreply@anthropic.com>'.
4. Push: 'git push -u origin $branch'. Never force-push. Never push to main.
5. Open the PR, ready for review (not a draft): gh pr create --base main --head $branch --title '${PR_PREFIX}type(scope): subject' --body '<body>'. The body is at most 40 lines with these ## headings in order: Why, What changed, Verification.
6. Print the PR URL on the last line of your reply."

  local -a cmd=(timeout "$TIMEOUT_S" claude -p "$prompt" --model "$MODEL" --permission-mode acceptEdits
    --setting-sources user --no-session-persistence --max-budget-usd "$BUDGET" --allowedTools)
  while IFS= read -r t; do cmd+=("$t"); done < <(allowed_tools "$branch")

  if [ "$DRY" = 1 ]; then
    printf '\n=== DRY RUN: task #%s by @%s ===\nrepo:      %s\ntask:      %s\nbranch:    %s\nworktree:  %s\non-it:     %s on it: %s\nsteps:     git fetch origin main; git worktree add -b %s <worktree> origin/main; npm ci --prefer-offline --ignore-scripts\n           then (cd <worktree> && claude -p ...), then verify PR with gh and npm run build, then post done/blocked\nclaude:    ' \
      "$id" "$author" "$REPO" "$oneline" "$branch" "$wt" "$ME" "$oneline" "$branch"
    printf '%q ' "${cmd[@]:0:4}"; printf '<prompt> '; printf '%q ' "${cmd[@]:5}"; printf '\n--- prompt ---\n%s\n--- end ---\n' "$prompt"
    return 0
  fi

  echo "$id" >> "$HANDLED" || { log "cannot record #$id as handled; skipping"; return 1; }   # claim before any work: never run a task twice
  t0="$(date +%s)"
  log "task #$id by @$author: $oneline"
  post "$ME on it: $oneline" || log "could not post the on-it message"

  git fetch -q origin main || { block "could not fetch origin/main"; return 1; }
  mkdir -p "$(dirname "$wt")" "$(dirname "$logs")" && git worktree add -q -b "$branch" "$wt" origin/main || { block "could not create worktree $branch"; return 1; }
  # npm ci beats a symlinked node_modules (Turbopack rejects symlinks outside the project root) and an APFS clone (3.2s vs 3.8s)
  (cd "$wt" && npm ci --prefer-offline --no-audit --no-fund --ignore-scripts >"$logs.npm-ci.log" 2>&1) || { block "npm ci failed in the worktree"; return 1; }

  log "running claude in $wt (timeout ${TIMEOUT_S}s, model $MODEL)"
  (cd "$wt" && "${cmd[@]}" </dev/null) 2>&1 | tee "$logs.claude.log" | sed 's/^/    claude: /' >&2
  rc="${PIPESTATUS[0]}"
  log "claude exited $rc after $(( $(date +%s) - t0 ))s"

  # Trust the repo, not the model's report: find the PR and check the pushed head and the build.
  pr="$(gh pr list --repo "$REPO" --head "$branch" --state open --json number,title --jq '.[0] | select(.) | "\(.number)\t\(.title)"' 2>/dev/null)"
  [ -n "$pr" ] || { block "no PR was opened for \"$oneline\" (claude exit $rc)"; return 1; }
  pr_num="${pr%%$'\t'*}"; pr_title="${pr#*$'\t'}"
  head="$(git -C "$wt" rev-parse HEAD)"; remote="$(git -C "$wt" ls-remote origin "refs/heads/$branch" | cut -f1)"
  [ -z "$(git -C "$wt" status --porcelain --untracked-files=no)" ] && [ "$head" = "$remote" ] ||
    { block "PR #$pr_num is open but the worktree has uncommitted or unpushed changes"; return 1; }
  (cd "$wt" && npm run build >"$logs.build.log" 2>&1) || { block "PR #$pr_num is open but npm run build fails on it"; return 1; }

  log "done in $(( $(date +%s) - t0 ))s: PR #$pr_num"
  post "$ME done: $pr_title, PR #$pr_num" || log "could not post the done message"
}

scan() { # one pass over the board; non-zero if the fetch failed
  local rows id login b body task
  rows="$(fetch)" || return 1
  [ -n "$rows" ] || return 0
  while IFS=$'\t' read -r -u 3 id login b; do
    [ -n "$id" ] || continue
    grep -qx "$id" "$HANDLED" && continue
    body="$(printf '%s' "$b" | b64d | tr -d '\r')"
    task="$(printf '%s' "$body" | task_text)"
    [ -n "$task" ] || continue
    if [ "$BASELINE" = 1 ]; then echo "$id" >> "$HANDLED"; log "baseline: task #$id marked handled"; continue; fi
    handle "$id" "$login" "$task"
    [ -z "${WORKER_CLEAN_NODE_MODULES:-}" ] || rm -rf "$WORKER_DIR/worktrees/$REPO"/*/node_modules   # keeps a small cloud disk from filling
  done 3< <(printf '%s\n' "$rows" | sort -n)
  return 0   # a blocked task was already reported on the board; only a failed fetch is a scan failure
}

log "watching $REPO issue #$ISSUE (interval ${INTERVAL}s, lookback ${LOOKBACK_H}h, handled file $HANDLED)"
while :; do
  scan || { [ "$ONCE" = 1 ] && die "could not reach GitHub"; log "board fetch failed; retrying in ${INTERVAL}s"; }
  [ "$ONCE" = 1 ] && break
  sleep "$INTERVAL"
done
