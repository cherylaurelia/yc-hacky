#!/usr/bin/env bash
# Claude Code hook that puts any session on the team agent board and lets the voice coworker
# approve its tool calls. One script serves four events, picked from the stdin JSON:
#   PermissionRequest  post "needs approval (req ID)", wait for "req ID allow|deny" on the board
#   Notification       post "blocked: <message>" (idle prompt, MCP question)
#   Stop               post "done: <summary>" when the turn ran longer than COWORKER_DONE_MIN seconds
#   UserPromptSubmit   record the turn start time (for Stop)
# Needs bash, gh (logged in) and jq. On any error it prints nothing and exits 0, so Claude Code
# falls back to its own terminal prompt. Install with hooks/install.sh.
# Env: COWORKER_REPO    board repo owner/name   (default: origin of the session's repo)
#      COWORKER_BOARD   board issue number      (default 1)
#      COWORKER_NAME    first name in the tag   (default: git user.name first word, then $USER)
#      COWORKER_TIMEOUT seconds to wait for an approval reply (default 90)
#      COWORKER_APPROVERS comma list of GitHub logins whose replies count (default: the gh user)
#      COWORKER_DONE_MIN  seconds a turn must run before "done" is posted (default 60)
#      COWORKER_DEBUG   set to log stderr to ~/.claude/coworker-hook/debug.log
set -u
STATE="${COWORKER_STATE_DIR:-$HOME/.claude/coworker-hook}"
mkdir -p "$STATE" 2>/dev/null
if [ -n "${COWORKER_DEBUG:-}" ]; then exec 2>>"$STATE/debug.log"; else exec 2>/dev/null; fi
command -v jq >/dev/null && command -v gh >/dev/null || exit 0

IN="$(cat)"
j() { printf '%s' "$IN" | jq -r "$1"; }
EVENT="$(j '.hook_event_name // empty')"
CWD="$(j '.cwd // empty')"; [ -d "$CWD" ] || CWD="$PWD"
KEY="$(j '.session_id // "nosession"')"; KEY="${KEY//[^A-Za-z0-9_-]/_}"

if [ "$EVENT" = UserPromptSubmit ]; then
  date +%s > "$STATE/$KEY.start"; rm -f "$STATE/$KEY.done"
  find "$STATE" -type f ! -name debug.log -mtime +2 -delete
  exit 0
fi

NUM='^[0-9]+$'
BOARD="${COWORKER_BOARD:-1}"; [[ "$BOARD" =~ $NUM ]] || exit 0
TIMEOUT="${COWORKER_TIMEOUT:-90}"; [[ "$TIMEOUT" =~ $NUM ]] || TIMEOUT=90
DONE_MIN="${COWORKER_DONE_MIN:-60}"; [[ "$DONE_MIN" =~ $NUM ]] || DONE_MIN=60

# owner/name from the origin remote of $1 (same parsing as tools/board)
repo_of() {
  local u p; u="$(git -C "$1" remote get-url origin)" || return 1
  case "$u" in
    *://*) p="${u#*://}"; p="${p#*/}" ;;
    git@*:*) p="${u#*:}" ;;
    *) return 1 ;;
  esac
  p="${p%.git}"; p="${p%/}"
  [[ "$p" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] && printf '%s' "$p"
}
SESSION_REPO="$(repo_of "$CWD")"
REPO="${COWORKER_REPO:-$SESSION_REPO}"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 0
WHERE="${SESSION_REPO#*/}"; [ -n "$WHERE" ] || WHERE="$(basename "$CWD")"

NAME="${COWORKER_NAME:-$(git -C "$CWD" config user.name | awk '{print $1}')}"
NAME="$(printf '%s' "${NAME:-${USER:-someone}}" | tr -d '[]\n')"
TAG="[$NAME's Claude]"

# jq: one line, secrets masked, @mentions defused, cut to $n characters
CLEAN='def clean($n): gsub("\\s+"; " ")
  | gsub("(?<k>\\b(gh[pousr]_|sk-|xox[a-z]-)|(token|key|secret|passw(or)?d|authorization|bearer)[=: ]+(bearer |basic )?)[^ ]+"; "\(.k)***"; "i")
  | gsub("@"; "@\u200b") | ltrimstr(" ") | if length > $n then .[:$n] + "…" else . end;'

# post $1 to the board; prints "<comment id> <created_at>"
post() { gh api "repos/$REPO/issues/$BOARD/comments" -f body="$1" --jq '"\(.id) \(.created_at)"'; }

permission() {
  local tool what id out pid cts me ok rows verdict note msg deadline
  tool="$(j '.tool_name // empty')"
  case "$tool" in ''|AskUserQuestion|ExitPlanMode) return ;; esac
  me="$(gh api user --jq .login)" && [ -n "$me" ] || return
  ok="${COWORKER_APPROVERS:-$me}"
  what="$(printf '%s' "$IN" | jq -r "$CLEAN"' .tool_name + " " + (.tool_input | (.command // .file_path // .notebook_path // .url // .pattern // .query // tojson)) | clean(140)')"
  id="$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  out="$(post "$TAG needs approval (req $id): $what in $WHERE")" || return
  read -r pid cts <<<"$out"
  deadline=$(( $(date +%s) + TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    sleep 3
    rows="$(gh api --paginate "repos/$REPO/issues/$BOARD/comments?per_page=100&since=$cts" --jq '.[] | {id, u: .user.login, b: .body}')" || continue
    # first reply after our post, from an approver, saying "req ID" then an allow or deny word
    verdict="$(printf '%s' "$rows" | jq -rs --arg id "$id" --argjson pid "$pid" --arg ok "$ok" '
      ($ok | ascii_downcase | split(",") | map(gsub("\\s"; ""))) as $ok
      | [ .[] | select(.id > $pid and ((.u | ascii_downcase) as $u | $ok | index($u) != null))
          | .b | capture("req\\s+" + $id + "\\b(?<r>[\\s\\S]*)"; "i").r
          | capture("\\b(?<w>allow|approved?|yes|deny|denied|no|reject(ed)?)\\b(?<n>[\\s\\S]*)"; "i")
          | "\(if .w | test("^(allow|approved?|yes)$"; "i") then "allow" else "deny" end)\t\(.n | gsub("^[\\s,:.-]+|\\s+$"; ""))" ]
      | first // empty')"
    [ -n "$verdict" ] || continue
    note="${verdict#*$'\t'}"
    if [ "${verdict%%$'\t'*}" = allow ]; then
      jq -nc '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "allow"}}}'
    else
      msg="Denied by voice from the coworker${note:+: $note}"
      jq -nc --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "deny", message: $m}}}'
    fi
    return
  done
}

case "$EVENT" in
  PermissionRequest) permission ;;
  Notification)
    [ "$(j '.notification_type // empty')" = permission_prompt ] && exit 0   # PermissionRequest already asked
    [ -e "$STATE/$KEY.done" ] && exit 0                                      # "done" already told the board
    post "$TAG blocked: $(printf '%s' "$IN" | jq -r "$CLEAN"' (.message // "waiting for input") | sub("[ .]+$"; "") | clean(200)') in $WHERE" >/dev/null
    ;;
  Stop)
    [ "$(j '.stop_hook_active // false')" = true ] && exit 0
    start="$(cat "$STATE/$KEY.start")" && rm -f "$STATE/$KEY.start" || exit 0
    [[ "$start" =~ $NUM ]] && [ $(( $(date +%s) - start )) -ge "$DONE_MIN" ] || exit 0
    post "$TAG done: $(printf '%s' "$IN" | jq -r "$CLEAN"' ((.last_assistant_message // "") | split("\n") | map(select(test("\\S"))) | first // "finished") | sub("[ .]+$"; "") | clean(140)') in $WHERE" >/dev/null \
      && touch "$STATE/$KEY.done"
    ;;
esac
exit 0
