#!/usr/bin/env bash
# One-command live demo scenario: real Claude Code sessions that make the Coworker speak up, in order.
#
#   demo/run.sh [--board N] [--auto-approve] [--stuck auto|on|off] [--no-watch] [--attach]
#
# Makes 3 scratch git repos under /tmp/coworker-demo, installs the Coworker hooks into each one
# (hooks/install.sh --project, so nothing global changes), and starts a real interactive Claude Code in a
# tmux window per repo (tmux session "coworker-demo", COWORKER_NAME sets the name on the board):
#   Eithan's Claude  demo-storefront     edits db/schema.sql, runs `npm run migrate` (not allowlisted)  -> "needs approval"  ~15 s
#   Aidan's Claude   demo-payments-api   re-runs a "flaky" `npm test` that fails 10 times in a row      -> "stuck"           ~40-60 s
#   Cheryl's Codex    demo-docs-site      runs a ~64 s indexer                                           -> "done"            ~70 s
# Then it watches the board and prints each post with its time since launch. Ctrl-C only stops the watching.
#
#   --board N        board issue number. Default 4 (the scratch "Board TEST" issue); the environment is ignored,
#                    so the real board is only used when you write --board 1.
#   --auto-approve   rehearsal: answer every "needs approval" from here ("req ID allow") so no voice is needed
#   --stuck MODE     auto (default): run the retry session only if hooks/coworker-hook.sh has a stuck detector
#   --no-watch       start the sessions and return
#   --attach         tmux attach to the session when it is up (watching is off, you are in tmux)
#   --keep-idle      keep the idle_prompt "blocked" hook; by default it is removed so a finished session
#                    does not post "waiting for input" a minute later and break the script order
#   --long SECS      length of the docs-site indexer, so "done" lands after COWORKER_DONE_MIN (60). Default 64
#   --fails N        how many times the payments-api check fails before it passes (default 10)
#   --wait SECS      stop watching after this long (default 150)
# Env: DEMO_MODEL=sonnet  COWORKER_REPO=owner/name (default: origin of this checkout)  COWORKER_DEMO_DIR=/tmp/coworker-demo
#      COWORKER_HOOKS_DIR=<dir with install.sh and coworker-hook.sh> (default: hooks/ of this checkout)
# Undo everything: demo/reset.sh
set -u
. "$(dirname "$0")/common.sh"

BOARD=4 STUCK=auto WATCH=1 AUTO=0 ATTACH=0 KEEP_IDLE=0 LONG=64 FAILS=10 WAIT=150 DEBUG=0
while [ $# -gt 0 ]; do
  case "$1" in
    --board) BOARD="${2:-}"; shift ;;
    --stuck) STUCK="${2:-}"; shift ;;
    --long) LONG="${2:-}"; shift ;;
    --fails) FAILS="${2:-}"; shift ;;
    --wait) WAIT="${2:-}"; shift ;;
    --auto-approve) AUTO=1 ;;
    --no-watch) WATCH=0 ;;
    --attach) ATTACH=1; WATCH=0 ;;
    --keep-idle) KEEP_IDLE=1 ;;
    --debug) DEBUG=1 ;;
    -h|--help) sed -n '2,/^set -u/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument $1 (try --help)" ;;
  esac
  shift
done
is_num "$BOARD" || die "--board needs an issue number, got '$BOARD'"
is_num "$LONG" && [ "$LONG" -ge 16 ] || die "--long needs a whole number of seconds, 16 or more"
is_num "$FAILS" || die "--fails needs a whole number"
is_num "$WAIT" || die "--wait needs a whole number of seconds"
case "$STUCK" in auto|on|off) ;; *) die "--stuck takes auto, on or off" ;; esac

# ---- preflight: fail before touching anything ----
need tmux claude gh jq git node npm bash
gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
ME="$(gh api user --jq .login)" && [ -n "$ME" ] || die "could not read the gh user"
REPO="$(board_repo)"
issue="$(gh api "repos/$REPO/issues/$BOARD" --jq 'if .pull_request then "pull request" else "\(.state)\t\(.title)" end')" \
  || die "issue #$BOARD not found in $REPO"
case "$issue" in open*) ;; *) die "issue #$BOARD in $REPO is not an open issue ($issue)" ;; esac
HOOKS="${COWORKER_HOOKS_DIR:-$DEMO_ROOT/hooks}"
[ -x "$HOOKS/install.sh" ] && [ -f "$HOOKS/coworker-hook.sh" ] || die "no install.sh / coworker-hook.sh in $HOOKS"
if [ "$STUCK" = auto ]; then
  if grep -qi stuck "$HOOKS/coworker-hook.sh"; then STUCK=on; else
    STUCK=off
    echo "demo: stuck step SKIPPED: $HOOKS/coworker-hook.sh has no stuck detector yet, so a retry loop would post nothing."
    echo "      Once the detector lands this runs by itself. --stuck on starts the retry session anyway."
  fi
fi
tmux has-session -t "$SESSION" 2>/dev/null && die "tmux session $SESSION already exists; run demo/reset.sh first"
[ -e "$DEMO_DIR" ] || [ -e "$STATE" ] && die "$DEMO_DIR (or its state file) exists; run demo/reset.sh first"

# ---- scratch repos ----
w() { mkdir -p "$(dirname "$1")" && cat > "$1" || die "cannot write $1"; }
mkrepo() { # $1 name; the files are already written
  local d="$DEMO_DIR/$1"
  git -C "$d" init -q -b main && git -C "$d" config user.name "Demo Dev" && git -C "$d" config user.email demo@example.com \
    && git -C "$d" add -A && git -C "$d" commit -q -m "initial commit" || die "git setup failed in $d"
  mkdir -p "$d/.claude" && echo ".claude/" >> "$d/.git/info/exclude"
  # hooks, project-local: .claude/settings.local.json + .claude/hooks/coworker-hook.sh (nothing under ~/.claude changes)
  (cd "$d" && "$HOOKS/install.sh" --project >/dev/null) || die "hooks/install.sh failed in $d"
  local s="$d/.claude/settings.local.json" allow="$2" tmp
  tmp="$(jq --argjson allow "$allow" --argjson keep "$KEEP_IDLE" \
    '.permissions = {defaultMode: "acceptEdits", allow: $allow} | if $keep == 0 then del(.hooks.Notification) else . end' "$s")" \
    && printf '%s\n' "$tmp" > "$s" || die "could not write permissions into $s"
}

mkdir -p "$DEMO_DIR/.launch" || die "cannot create $DEMO_DIR"

w "$DEMO_DIR/demo-storefront/package.json" <<'EOF'
{ "name": "storefront", "private": true, "scripts": { "migrate": "node scripts/migrate.js" } }
EOF
w "$DEMO_DIR/demo-storefront/db/schema.sql" <<'EOF'
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer TEXT NOT NULL,
  total_cents INTEGER NOT NULL
);
EOF
w "$DEMO_DIR/demo-storefront/scripts/migrate.js" <<'EOF'
// Harmless stand-in for a database migration: reads db/schema.sql and prints a summary.
const sql = require("fs").readFileSync("db/schema.sql", "utf8");
const tables = (sql.match(/CREATE TABLE/gi) || []).length;
const cols = sql.split("\n").filter((l) => /^\s+\w+\s+(INTEGER|TEXT)/i.test(l)).length;
console.log(`migrate: applied db/schema.sql (${tables} table, ${cols} columns), ok`);
EOF
mkrepo demo-storefront '[]'

w "$DEMO_DIR/demo-payments-api/package.json" <<'EOF'
{ "name": "payments-api", "private": true, "scripts": { "test": "node scripts/ci-check.js" } }
EOF
w "$DEMO_DIR/demo-payments-api/.gitignore" <<'EOF'
.ci-attempts
EOF
w "$DEMO_DIR/demo-payments-api/scripts/ci-check.js" <<'EOF'
// Stand-in for a CI check that talks to a flaky sandbox gateway: it fails the first DEMO_FAILS runs, then passes.
const fs = require("fs");
const FAILS = Number(process.env.DEMO_FAILS || 10);
const n = (fs.existsSync(".ci-attempts") ? Number(fs.readFileSync(".ci-attempts", "utf8")) : 0) + 1;
fs.writeFileSync(".ci-attempts", String(n));
console.log("checking webhook delivery to the sandbox gateway ...");
setTimeout(() => {
  if (n <= FAILS) {
    console.error(`FAIL  webhook delivery: ECONNRESET from sandbox gateway (run ${n}). Known flaky, a re-run usually passes.`);
    process.exit(1);
  }
  console.log(`ok    webhook delivery verified (run ${n})`);
}, 2500);
EOF
mkrepo demo-payments-api '["Bash(npm test:*)"]'

w "$DEMO_DIR/demo-docs-site/package.json" <<'EOF'
{ "name": "docs-site", "private": true, "scripts": { "index": "bash scripts/reindex.sh" } }
EOF
w "$DEMO_DIR/demo-docs-site/scripts/reindex.sh" <<EOF
#!/usr/bin/env bash
# Stand-in for a search index rebuild that takes about a minute.
steps=16
for i in \$(seq 1 \$steps); do echo "indexing section \$i/\$steps ..."; sleep $((LONG / 16)); done
echo '{"pages": 128}' > docs/search-index.json   # a real rebuild writes its output: the hook posts "done" only for a turn that changed files
echo "indexed 128 pages in $(( (LONG / 16) * 16 ))s"
EOF
w "$DEMO_DIR/demo-docs-site/docs/index.md" <<'EOF'
# Docs
Welcome. The search index is rebuilt with `npm run index`.
EOF
mkrepo demo-docs-site '["Bash(npm run index:*)"]'

# ---- one launcher script per session ----
unset_claude_env='unset CLAUDECODE CLAUDE_PID ${!CLAUDE_CODE_*}'
MODEL="${DEMO_MODEL:-sonnet}"
launcher() { # $1 first name, $2 repo, $3 prompt
  local f="$DEMO_DIR/.launch/$2" dbg=""
  [ "$DEBUG" = 1 ] && dbg=" COWORKER_DEBUG=1"
  printf '%s\n' "$3" > "$f.prompt" || die "cannot write $f.prompt"
  cat > "$f.sh" <<EOF || die "cannot write $f.sh"
#!/usr/bin/env bash
cd "$DEMO_DIR/$2" || exit 1
$unset_claude_env
export COWORKER_NAME="$1" COWORKER_BOARD="$BOARD" COWORKER_REPO="$REPO" DEMO_FAILS="$FAILS"$dbg
claude --model "$MODEL" --permission-mode acceptEdits "\$(cat "$f.prompt")"
echo "claude exited with \$?. Press Enter to close this window."; read -r _
EOF
}
launcher Cheryl demo-docs-site "Rebuild the search index by running exactly \`npm run index\` (no pipes, no redirects, no extra flags). It takes about a minute, that is normal, so wait for it to finish. Then tell me in one sentence how many pages were indexed."
launcher Eithan demo-storefront "Add a created_at column (TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) to the orders table in db/schema.sql, then apply it by running exactly \`npm run migrate\` (no pipes, no extra flags) once. Report what the migration printed in one sentence. Change nothing else."
launcher Aidan demo-payments-api "CI is red on the payments webhook check. It is a known flaky sandbox gateway, so re-run \`npm test\` until it goes green; it can take many runs. Run exactly \`npm test\` each time, one run per step, and run no other shell commands. Do not change any code and do not ask me anything, I am in a meeting. When it finally passes, tell me how many runs it took."

# ---- state, then the tmux session ----
SINCE="$(date -u -v-2S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '2 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"
jq -n --arg board "$BOARD" --arg repo "$REPO" --arg since "$SINCE" --arg me "$ME" '{board: $board, repo: $repo, since: $since, me: $me}' > "$STATE" || die "cannot write $STATE"

T0="$(date +%s)"
IDS=""
start() { # $1 first name, $2 repo; appends the new window id to IDS
  local id name="$1's Claude" cmd="bash $DEMO_DIR/.launch/$2.sh"
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    id="$(tmux new-window -d -P -F '#{window_id}' -t "$SESSION:" -n "$name" -c "$DEMO_DIR/$2" "$cmd")"
  else
    id="$(tmux new-session -d -P -F '#{window_id}' -s "$SESSION" -n "$name" -x 200 -y 50 -c "$DEMO_DIR/$2" "$cmd")"
  fi || die "tmux could not start the $name window"
  IDS="$IDS $id"
  echo "started   $name  ($2)"
}
echo "Board #$BOARD in $REPO ($(printf '%s' "$issue" | cut -f2)), approvals from $ME"
[ "$BOARD" = 1 ] && echo "*** REAL BOARD #1 ***"
start Cheryl demo-docs-site          # first: its "done" needs the longest turn
start Eithan demo-storefront
if [ "$STUCK" = on ]; then sleep 4; start Aidan demo-payments-api; fi

# A new folder asks "trust this folder?" (the highlighted answer is "No, exit"): Down, Enter. Trusted folders skip it.
accept_trust() {
  local deadline=$(( $(date +%s) + 45 )) pending="$IDS" sent="" id pane keep
  while [ -n "${pending// }" ] && [ "$(date +%s)" -lt "$deadline" ]; do
    keep=""
    for id in $pending; do
      pane="$(tmux capture-pane -p -t "$id" 2>/dev/null)" || { keep="$keep $id"; continue; }
      case "$pane" in
        *"I trust this folder"*)
          case "$sent" in *" $id "*) ;; *) tmux send-keys -t "$id" Down && sleep 0.3 && tmux send-keys -t "$id" Enter; sent="$sent $id " ;; esac
          keep="$keep $id" ;;
        *"Claude Code v"*) ;;
        *) keep="$keep $id" ;;
      esac
    done
    pending="$keep"; sleep 1
  done
  [ -z "${pending// }" ] || echo "demo: warning: no Claude Code banner after 45 s in window(s)$pending. Look: tmux attach -t $SESSION" >&2
}
accept_trust
echo "launched in $(( $(date +%s) - T0 )) s. Windows: tmux attach -t $SESSION   (Ctrl-b n to switch)"
[ "$ATTACH" = 1 ] && exec tmux attach -t "$SESSION"
[ "$WATCH" = 1 ] || { echo "Reset when done: demo/reset.sh"; exit 0; }

# ---- watch the board ----
echo "Watching board #$BOARD for $WAIT s (Ctrl-C stops watching, the sessions keep running)."
trap 'echo; echo "stopped watching. Sessions are still up: tmux attach -t $SESSION. Reset: demo/reset.sh"; exit 130' INT
SEEN=" " REQS="NOMATCH-" A_AT="" S_AT="" D_AT="" REPLIED=" "
end=$(( T0 + WAIT ))
while :; do
  rows="$(gh api --paginate "repos/$REPO/issues/$BOARD/comments?per_page=100&since=$SINCE" --jq '.[] | {id, t: (.created_at | fromdateiso8601), b: .body}' 2>/dev/null \
    | jq -r --arg mark "$DEMO_MARK" --arg reqs "$REQS" 'select(.b | test($mark) or test("req\\s+(" + $reqs + ")\\b"; "i")) | [.id, .t, (.b | gsub("\\s+"; " ") | sub(" ?<!--.*$"; "") | .[0:170])] | @tsv')" || rows=""
  while IFS=$'\t' read -r id t body; do
    [ -n "${id:-}" ] || continue
    case "$SEEN" in *" $id "*) continue ;; esac
    SEEN="$SEEN$id "; at=$(( t - T0 ))
    printf '+%3ds  %s\n' "$at" "$body"
    case "$body" in
      *"needs approval (req "*)
        [ -n "$A_AT" ] || A_AT="$at"
        req="$(printf '%s' "$body" | sed -E 's/.*\(req ([0-9a-f]+)\).*/\1/')"; REQS="$REQS|$req"
        if [ "$AUTO" = 1 ]; then
          case "$REPLIED" in *" $req "*) ;; *)
            REPLIED="$REPLIED$req "
            gh api "repos/$REPO/issues/$BOARD/comments" -f body="req $req allow (demo/run.sh --auto-approve)" >/dev/null \
              && echo "       -> auto-approved req $req" || echo "demo: could not post the auto-approval for $req" >&2 ;;
          esac
        fi ;;
      *"] stuck:"*) [ -n "$S_AT" ] || S_AT="$at"; req="$(printf '%s' "$body" | sed -nE 's/.*\(req ([0-9a-f]+)\).*/\1/p')"; [ -z "$req" ] || REQS="$REQS|$req" ;;
      *"] done:"*) [ -n "$D_AT" ] || D_AT="$at" ;;
    esac
  done <<< "$rows"
  [ -n "$A_AT" ] && [ -n "$D_AT" ] && { [ "$STUCK" = off ] || [ -n "$S_AT" ]; } && break
  [ "$(date +%s)" -lt "$end" ] || break
  sleep 3
done

fmt() { [ -n "$1" ] && echo "+${1}s" || echo "MISSING"; }
echo "approval: $(fmt "$A_AT")   stuck: $( [ "$STUCK" = off ] && echo skipped || fmt "$S_AT")   done: $(fmt "$D_AT")"
echo "Sessions are still up (tmux attach -t $SESSION). Reset: demo/reset.sh"
[ -n "$A_AT" ] && [ -n "$D_AT" ] && { [ "$STUCK" = off ] || [ -n "$S_AT" ]; }
