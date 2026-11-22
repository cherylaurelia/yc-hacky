#!/usr/bin/env bash
# Claude Code hook that puts any session on the team agent board and lets the voice coworker
# approve its tool calls. One script serves these events, picked from the stdin JSON:
#   PermissionRequest  post "needs approval (req ID)", wait for "req ID allow|deny" on the board
#   Notification       post "blocked: <message>" (idle prompt, MCP question)
#   Stop               post "done: <summary>" when the turn ran longer than COWORKER_DONE_MIN seconds
#   UserPromptSubmit   record the turn start time (for Stop)
#   PostToolUseFailure count failures per command; the same one failing COWORKER_STUCK_COUNT times in
#                      COWORKER_STUCK_MINUTES posts "stuck: retried X N times in M min, about $C (req ID)"
#   PostToolUse        a success clears that command's failures
#   PreToolUse         this and PostToolUse end the session with continue:false when the board has
#                      "req ID stop" for a req this session posted, checked at most every 10 s
# Every post ends with an invisible <!-- coworker:{json} --> comment (kind, req, tool, command, file,
# line, diff, stuck) for the voice agent and the UI; the contract is v1, see ctx() below.
# Needs bash, gh (logged in) and jq. On any error it prints nothing and exits 0, so Claude Code
# falls back to its own terminal prompt. Install with hooks/install.sh.
# Env: COWORKER_REPO    board repo owner/name   (default: origin of the session's repo)
#      COWORKER_BOARD   board issue number      (default: the repo's oldest open issue labeled "board", looked up
#                       once per 10 min; a repo with none gets no posts, the hook never falls back to #1)
#      COWORKER_NAME    first name in the tag   (default: git user.name first word, then $USER)
#      COWORKER_TIMEOUT seconds to wait for an approval reply (default 90)
#      COWORKER_APPROVERS comma list of GitHub logins whose replies count (default: the gh user)
#      COWORKER_DONE_MIN  seconds a turn must run before "done" is posted (default 60)
#      COWORKER_STUCK_COUNT / COWORKER_STUCK_MINUTES  failures and window for "stuck" (default 3 in 20)
#      COWORKER_STOP_EVERY  seconds between board checks for a stop reply (default 10)
#      COWORKER_DEBUG   set to log stderr to ~/.claude/coworker-hook/debug.log
set -u
STATE="${COWORKER_STATE_DIR:-$HOME/.claude/coworker-hook}"
TMP="${TMPDIR:-/tmp}"; TMP="${TMP%/}/coworker"   # per-session stuck/stop state, one file per session
mkdir -p "$STATE" "$TMP" 2>/dev/null
if [ -n "${COWORKER_DEBUG:-}" ]; then exec 2>>"$STATE/debug.log"; else exec 2>/dev/null; fi
command -v jq >/dev/null && command -v gh >/dev/null || exit 0

IN="$(cat)"
j() { printf '%s' "$IN" | jq -r "$1"; }
EVENT="$(j '.hook_event_name // empty')"
CWD="$(j '.cwd // empty')"; [ -d "$CWD" ] || CWD="$PWD"
KEY="$(j '.session_id // "nosession"')"; KEY="${KEY//[^A-Za-z0-9_-]/_}"
SF="$TMP/$KEY"
# SF lines:  F <sig> <epoch> failure   S <sig> <epoch> success   P <sig> stuck posted
#            R <req> <created_at> <why> req this session posted   A <login> approver   D <comment id> stop used

if [ "$EVENT" = UserPromptSubmit ]; then
  date +%s > "$STATE/$KEY.start"; rm -f "$STATE/$KEY.done"
  find "$STATE" -type f ! -name debug.log -mtime +2 -delete; find "$TMP" -type f -mtime +2 -delete
  exit 0
fi
# Pre/PostToolUse run on every tool call: a session with no failures and no posts has nothing to do
case "$EVENT" in PreToolUse|PostToolUse) [ -s "$SF" ] || exit 0 ;; esac

NUM='^[0-9]+$'
BOARD="${COWORKER_BOARD:-}"
[ -z "$BOARD" ] || [[ "$BOARD" =~ $NUM ]] || exit 0
TIMEOUT="${COWORKER_TIMEOUT:-90}"; [[ "$TIMEOUT" =~ $NUM ]] || TIMEOUT=90
DONE_MIN="${COWORKER_DONE_MIN:-60}"; [[ "$DONE_MIN" =~ $NUM ]] || DONE_MIN=60
STUCK_COUNT="${COWORKER_STUCK_COUNT:-3}"; [[ "$STUCK_COUNT" =~ $NUM ]] && [ "$STUCK_COUNT" -ge 1 ] || STUCK_COUNT=3
STUCK_MIN="${COWORKER_STUCK_MINUTES:-20}"; [[ "$STUCK_MIN" =~ $NUM ]] || STUCK_MIN=20
STOP_EVERY="${COWORKER_STOP_EVERY:-10}"; [[ "$STOP_EVERY" =~ $NUM ]] || STOP_EVERY=10

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
# The board is the repo's open issue labeled "board" (the app picks the same one: oldest first, not a PR), cached 10 min
# per repo, "0" meaning none. A failed lookup is not cached, so the next call asks again.
board_of() {
  local f="$STATE/board.${REPO//\//_}" t n now; now="$(date +%s)"
  read -r t n < "$f" 2>/dev/null
  if [[ "$t" =~ $NUM ]] && [[ "$n" =~ $NUM ]] && [ $(( now - t )) -lt 600 ]; then printf '%s' "$n"; return; fi
  n="$(gh api "repos/$REPO/issues?labels=board&state=open&sort=created&direction=asc&per_page=10" --jq '[.[] | select(.pull_request | not)] | (.[0].number // 0)')" \
    && [[ "$n" =~ $NUM ]] || return 1
  echo "$now $n" > "$f"; printf '%s' "$n"
}
[ -n "$BOARD" ] || { BOARD="$(board_of)" && [ "$BOARD" -ge 1 ] || exit 0; }
WHERE="${SESSION_REPO#*/}"; [ -n "$WHERE" ] || WHERE="$(basename "$CWD")"

NAME="${COWORKER_NAME:-$(git -C "$CWD" config user.name | awk '{print $1}')}"
NAME="$(printf '%s' "${NAME:-${USER:-someone}}" | tr -d '[]\n')"
TAG="[$NAME's Claude]"

# jq: secrets masked (mask); one line, @mentions defused, cut to $n characters (clean)
MASK='def mask: gsub("(?<k>\\b(gh[pousr]_|sk-|xox[a-z]-)|(token|key|secret|passw(or)?d|authorization|bearer)[=: ]+(bearer |basic )?)[^ \\n]+"; "\(.k)***"; "i");'
CLEAN="$MASK"'def clean($n): gsub("\\s+"; " ") | mask
  | gsub("@"; "@​") | ltrimstr(" ") | if length > $n then .[:$n] + "…" else . end;'

# post $1 to the board, with the context comment $2 under it; prints "<comment id> <created_at>"
post() { gh api "repos/$REPO/issues/$BOARD/comments" -f body="$1${2:+$'\n\n'$2}" --jq '"\(.id) \(.created_at)"'; }

# first line of the edit in file $1, read before the edit lands
line_of() {
  [ -f "$1" ] && [ "$(wc -c < "$1")" -lt 1000000 ] || return
  printf '%s' "$IN" | jq -r --rawfile f "$1" '(.tool_input.old_string // .tool_input.edits[0].old_string // "") as $o
    | if $o != "" and ($f | contains($o)) then ($f | split($o)[0] | split("\n") | length) else empty end'
}

# unified diff of what an Edit, MultiEdit or Write to file $1 changes
diff_of() {
  local t n i; case "$(j '.tool_name // empty')" in Edit|MultiEdit|Write) ;; *) return ;; esac
  t="$(mktemp -d)" || return
  if [ "$(j '.tool_name')" = Write ]; then
    { [ -f "$1" ] && [ "$(wc -c < "$1")" -lt 1000000 ] && cp "$1" "$t/a"; } || : > "$t/a"
    printf '%s' "$IN" | jq -j '.tool_input.content // ""' > "$t/b"
    diff -u -L "a/$1" -L "b/$1" "$t/a" "$t/b"
  else
    n="$(j '(.tool_input.edits // [.tool_input]) | length')"
    for ((i = 0; i < n; i++)); do
      printf '%s' "$IN" | jq -r ".tool_input | (.edits // [.])[$i].old_string // \"\"" > "$t/a"
      printf '%s' "$IN" | jq -r ".tool_input | (.edits // [.])[$i].new_string // \"\"" > "$t/b"
      diff -u -L "a/$1" -L "b/$1" "$t/a" "$t/b"
    done
  fi
  rm -rf "$t"
}

# The context comment on every post (contract v1, shared with the UI): ctx KIND [REQ_ID] [STUCK_JSON].
# @ < > are written as \uXXXX so GitHub never sees a mention or a comment terminator inside the JSON.
ctx() {
  local f line diff d c; f="$(j '.tool_input.file_path // .tool_input.notebook_path // empty')"
  line="$(line_of "$f")"; diff="$(diff_of "$f")"
  for d in "$diff" ""; do   # over 6000 characters: drop the diff
    c="$(printf '%s' "$IN" | jq -c --arg kind "$1" --arg req "${2:-}" --argjson stuck "${3:-null}" --arg agent "$NAME's Claude" \
      --arg repo "${SESSION_REPO:-$(basename "$CWD")}" --arg cwd "$CWD" --arg file "$f" --arg line "$line" --arg diff "$d" "$MASK"'
      def nul: if . == "" then null else . end;
      {v: 1, kind: $kind, req: ($req | nul), session: ((.session_id // "")[:8]), agent: $agent, cwd: $cwd, repo: $repo,
       tool: (.tool_name // null),
       command: ((.tool_input.command? // "") | if type == "string" then mask | gsub("^\\s+|\\s+$"; "") | .[:300] else "" end),
       file: ($file | nul), line: ($line | tonumber? // null),
       diff: ($diff | mask | if length > 3000 then .[:2985] + "\n…[truncated]" else . end | nul), stuck: $stuck}' \
      | sed 's/@/\\u0040/g; s/</\\u003c/g; s/>/\\u003e/g')" || return
    [ "${#c}" -lt 6000 ] && break
  done
  [ -n "$c" ] && printf '<!-- coworker:%s -->' "$c"
}

# this machine's GitHub login, fetched once per session
me_login() {
  local m; m="$(awk '$1 == "A" { print $2; exit }' "$SF" 2>/dev/null)"
  [ -n "$m" ] || { m="$(gh api user --jq .login)" && [ -n "$m" ] && echo "A $m" >> "$SF"; }
  printf '%s' "$m"
}

# First word of the GitHub profile name of login $1, else the login. This is who answered through the Coworker, which
# is not the agent's owner ($NAME). Cached a day per login; a failed lookup (slow network) is not cached.
person() {
  local f="$STATE/person.${1//[^A-Za-z0-9_-]/_}" n
  if [ -s "$f" ] && [ -z "$(find "$f" -mtime +1)" ]; then cat "$f"; return; fi
  if n="$(within_1s gh api "users/$1" --jq '(.name // "") | split(" ") | map(select(. != "")) | (.[0] // empty)')"; then
    n="$(printf '%s' "${n:-$1}" | tr -d '[]\n')"; echo "$n" > "$f"; printf '%s' "$n"
  else
    printf '%s' "$1"
  fi
}

permission() {
  local tool what id out pid cts me ok rows verdict who note msg deadline
  tool="$(j '.tool_name // empty')"
  case "$tool" in ''|AskUserQuestion|ExitPlanMode) return ;; esac
  me="$(me_login)" && [ -n "$me" ] || return
  ok="${COWORKER_APPROVERS:-$me}"
  what="$(printf '%s' "$IN" | jq -r "$CLEAN"' .tool_name + " " + (.tool_input | (.command // .file_path // .notebook_path // .url // .pattern // .query // tojson)) | clean(140)')"
  id="$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  out="$(post "$TAG needs approval (req $id): $what in $WHERE" "$(ctx approval "$id")")" || return
  read -r pid cts <<<"$out"
  echo "R $id $cts waiting on approval" >> "$SF"
  deadline=$(( $(date +%s) + TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    sleep 3
    rows="$(gh api --paginate "repos/$REPO/issues/$BOARD/comments?per_page=100&since=$cts" --jq '.[] | {id, u: .user.login, b: .body}')" || continue
    # first reply after our post, from an approver, saying "req ID" then an allow or deny word
    verdict="$(printf '%s' "$rows" | jq -rs --arg id "$id" --argjson pid "$pid" --arg ok "$ok" '
      ($ok | ascii_downcase | split(",") | map(gsub("\\s"; ""))) as $ok
      | [ .[] | select(.id > $pid and ((.u | ascii_downcase) as $u | $ok | index($u) != null))
          | .u as $who | (.b | capture("req\\s+" + $id + "\\b(?<r>[\\s\\S]*)"; "i").r
          | capture("\\b(?<w>allow|approved?|yes|deny|denied|no|reject(ed)?)\\b(?<n>[\\s\\S]*)"; "i"))
          | "\(if .w | test("^(allow|approved?|yes)$"; "i") then "allow" else "deny" end)\t\($who)\t\(.n | gsub("^[\\s,:.-]+|\\s+$"; ""))" ]
      | first // empty')"
    [ -n "$verdict" ] || continue
    who="${verdict#*$'\t'}"; note="${who#*$'\t'}"; who="${who%%$'\t'*}"
    if [ "${verdict%%$'\t'*}" = allow ]; then
      jq -nc '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "allow"}}}'
    else
      msg="Denied by $(person "$who") via Coworker${note:+: $note}"
      jq -nc --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "deny", message: $m}}}'
    fi
    return
  done
}

# What a tool call is, for counting repeats: the Bash command (trailing "2>&1" / "| tail" dropped), else tool + file
signature() {
  printf '%s' "$IN" | jq -r "$CLEAN"' .tool_name as $t | .tool_input // {}
    | if $t == "Bash" then (.command // "" | sub("(\\s*(2>&1|\\|\\s*(tail|head)\\b[^|]*))+\\s*$"; ""))
      else $t + " " + (.file_path // .notebook_path // .url // .pattern // "") end | clean(100)'
}

# estimated USD this session has cost so far, from the usage in its transcript; prints nothing when there is none.
# Prices are ESTIMATES in USD per million tokens (input, output) by model family, from the Claude API price list
# (Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0.10/0.50); cache reads 0.05x input, cache writes 1.25x (5 min) or 2x (1 h).
cost_of() {
  local t c; t="$(j '.transcript_path // empty')"; [ -f "$t" ] || return
  c="$(jq -Rn '{opus: [4, 20], sonnet: [2, 10], haiku: [0.1, 0.5]} as $P
    | [inputs | fromjson? | select(.type == "assistant" and (.message.usage | type) == "object") | .message]
    | group_by(.id) | map(max_by(.usage.output_tokens // 0))   # a message is written once per content block
    | map(. as $m | (["opus", "sonnet", "haiku"] | map(select(. as $f | ($m.model // "" | ascii_downcase) | contains($f))) | first) as $f
        | select($f != null) | $P[$f] as [$i, $o] | $m.usage as $u
        | (($u.input_tokens // 0) * $i + ($u.output_tokens // 0) * $o + ($u.cache_read_input_tokens // 0) * $i * 0.05
           + ($u.cache_creation.ephemeral_5m_input_tokens // $u.cache_creation_input_tokens // 0) * $i * 1.25
           + ($u.cache_creation.ephemeral_1h_input_tokens // 0) * $i * 2) / 1000000)
    | if length == 0 then empty else add end' "$t")" && [ -n "$c" ] && LC_NUMERIC=C printf '%.2f' "$c"
}

# run "$@" and print its output, giving up after about a second so a slow network never holds up a tool call
within_1s() {
  local o p i=0 rc; o="$(mktemp)" || return 1
  "$@" > "$o" 2>/dev/null & p=$!
  while kill -0 "$p" 2>/dev/null && [ "$i" -lt 10 ]; do sleep 0.1; i=$((i + 1)); done
  if kill -0 "$p" 2>/dev/null; then kill "$p"; wait "$p"; rm -f "$o"; return 1; fi
  wait "$p" && cat "$o"; rc=$?; rm -f "$o"; return $rc
}

# PostToolUseFailure counts a failure of this call's signature, PostToolUse clears it; the Nth failure
# inside the window posts "stuck" once per signature.
tooluse() {
  local sig h now n first mins cost id out pid cts stuck
  sig="$(signature)"; [ -n "$sig" ] || return
  h="$(printf '%s' "$sig" | cksum | cut -d' ' -f1)"; now="$(date +%s)"
  if [ "$EVENT" = PostToolUse ]; then
    grep -q "^F $h " "$SF" && echo "S $h $now" >> "$SF"
    return
  fi
  [ "$(j '.is_interrupt // false')" = true ] && return
  echo "F $h $now" >> "$SF"
  read -r n first <<<"$(awk -v h="$h" -v c="$(( now - STUCK_MIN * 60 ))" '
    $2 == h && $1 == "S" { n = 0; f = 0 }
    $2 == h && $1 == "F" && $3 >= c { n++; if (!f) f = $3 }
    END { print n + 0, f + 0 }' "$SF")"
  [ "$n" -ge "$STUCK_COUNT" ] && ! grep -q "^P $h\$" "$SF" || return
  mins=$(( (now - first + 59) / 60 )); [ "$mins" -ge 1 ] || mins=1
  cost="$(cost_of)"
  id="$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  stuck="$(jq -nc --argjson n "$n" --argjson m "$mins" --arg c "$cost" --arg s "$sig" '{count: $n, minutes: $m, cost_usd: ($c | tonumber? // null), signature: $s}')"
  me_login >/dev/null
  out="$(post "$TAG stuck: retried $sig $n times in $mins min${cost:+, about \$$cost so far} (req $id)" "$(ctx stuck "$id" "$stuck")")" || return
  read -r pid cts <<<"$out"
  printf 'P %s\nR %s %s stuck retrying %s\n' "$h" "$id" "$cts" "$sig" >> "$SF"
}

# "req ID stop" from an approver, for a req this session posted, ends the session: print continue:false once.
# Looks at the board at most every COWORKER_STOP_EVERY seconds and fails open on any error or a slow network.
stop_check() {
  local now last ok since ids used rows hit cid rid who why
  grep -q '^R ' "$SF" 2>/dev/null || return
  now="$(date +%s)"; last="$(cat "$SF.chk" 2>/dev/null)"
  [[ "$last" =~ $NUM ]] && [ $(( now - last )) -lt "$STOP_EVERY" ] && return
  echo "$now" > "$SF.chk"
  ok="${COWORKER_APPROVERS:-$(awk '$1 == "A" { print $2; exit }' "$SF")}"; [ -n "$ok" ] || return
  since="$(awk '$1 == "R" { print $3; exit }' "$SF")"
  ids="$(awk '$1 == "R" { print $2 }' "$SF" | paste -sd'|' -)"
  used="$(awk '$1 == "D" { print $2 }' "$SF" | paste -sd, -)"
  rows="$(within_1s gh api --paginate "repos/$REPO/issues/$BOARD/comments?per_page=100&since=$since" --jq '.[] | {id, u: .user.login, b: .body}')" || return
  hit="$(printf '%s' "$rows" | jq -rs --arg ok "$ok" --arg ids "$ids" --arg used ",$used," '
    ($ok | ascii_downcase | split(",") | map(gsub("\\s"; ""))) as $ok
    | [ .[] | select(((.u | ascii_downcase) as $u | $ok | index($u) != null) and (.id as $i | $used | contains(",\($i),") | not))
        | .id as $cid | .u as $who | (.b | capture("req\\s+(?<r>" + $ids + ")\\b[\\s,:.-]*stop\\b"; "i")) as $m | "\($cid) \($m.r) \($who)" ]
    | first // empty')" && [ -n "$hit" ] || return
  read -r cid rid who <<<"$hit"
  why="$(awk -v id="$rid" '$1 == "R" && $2 == id { $1 = $2 = $3 = ""; print }' "$SF" | sed 's/^ *//')"
  echo "D $cid" >> "$SF"
  jq -nc --arg r "Stopped by $(person "$who") via Coworker${why:+: $why}" '{continue: false, stopReason: $r}'
}

case "$EVENT" in
  PermissionRequest) permission ;;
  Notification)
    [ "$(j '.notification_type // empty')" = permission_prompt ] && exit 0   # PermissionRequest already asked
    [ -e "$STATE/$KEY.done" ] && exit 0                                      # "done" already told the board
    post "$TAG blocked: $(printf '%s' "$IN" | jq -r "$CLEAN"' (.message // "waiting for input") | sub("[ .]+$"; "") | clean(200)') in $WHERE" "$(ctx blocked)" >/dev/null
    ;;
  Stop)
    [ "$(j '.stop_hook_active // false')" = true ] && exit 0
    start="$(cat "$STATE/$KEY.start")" && rm -f "$STATE/$KEY.start" || exit 0
    [[ "$start" =~ $NUM ]] && [ $(( $(date +%s) - start )) -ge "$DONE_MIN" ] || exit 0
    post "$TAG done: $(printf '%s' "$IN" | jq -r "$CLEAN"' ((.last_assistant_message // "") | split("\n") | map(select(test("\\S"))) | first // "finished") | sub("[ .]+$"; "") | clean(140)') in $WHERE" "$(ctx 'done')" >/dev/null \
      && touch "$STATE/$KEY.done"
    ;;
  PreToolUse) stop_check ;;
  PostToolUse) tooluse; stop_check ;;
  PostToolUseFailure) tooluse ;;   # Claude Code ignores continue:false from this event, so it never stops
esac
exit 0
