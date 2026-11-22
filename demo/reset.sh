#!/usr/bin/env bash
# Undo demo/run.sh: kill the tmux session, delete the demo's comments from the board, delete the scratch repos.
#
#   demo/reset.sh [--dry-run] [--board N] [--since ISO8601]
#
# Board, repo and start time come from the state file run.sh wrote (/tmp/coworker-demo.state). Without it,
# pass --board N; it then looks back 3 hours. A comment is deleted only when it was created after the start
# and is one of ours: it names a scratch repo (demo-storefront, demo-payments-api, demo-docs-site), or it is
# a reply "req ID ..." to one of those posts (a spoken allow or stop, or --auto-approve). Teammates' own
# posts on the same board stay. Everything deleted is printed. --dry-run prints and deletes nothing.
set -u
. "$(dirname "$0")/common.sh"

DRY=0 BOARD="" SINCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --board) BOARD="${2:-}"; shift ;;
    --since) SINCE="${2:-}"; shift ;;
    -h|--help) sed -n '2,/^set -u/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument $1 (try --help)" ;;
  esac
  shift
done
need gh jq tmux
case "$DEMO_DIR" in /*coworker-demo*) ;; *) die "refusing to delete $DEMO_DIR: its path must contain coworker-demo" ;; esac

REPO=""
if [ -s "$STATE" ]; then
  jq -e '.board and .repo and .since' "$STATE" >/dev/null 2>&1 || die "$STATE is not a run.sh state file; delete it by hand"
  [ -n "$BOARD" ] || BOARD="$(jq -r .board "$STATE")"
  [ -n "$SINCE" ] || SINCE="$(jq -r .since "$STATE")"
  REPO="$(jq -r .repo "$STATE")"
fi
[ -n "$BOARD" ] || die "no state file at $STATE; pass --board N to clean a board anyway"
is_num "$BOARD" || die "--board needs an issue number, got '$BOARD'"
[ -n "$SINCE" ] || SINCE="$(date -u -v-3H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ)"
[[ "$SINCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$ ]] || die "--since must look like 2026-11-22T16:00:00Z"
[ -n "$REPO" ] || REPO="$(board_repo)"
valid_repo "$REPO" || die "bad repo '$REPO'"
rc=0
[ "$DRY" = 1 ] && echo "dry run: nothing will be killed or deleted"

# 1. tmux
if tmux has-session -t "$SESSION" 2>/dev/null; then
  if [ "$DRY" = 1 ]; then echo "would kill tmux session $SESSION"
  else tmux kill-session -t "$SESSION" && echo "killed tmux session $SESSION" || { echo "demo: could not kill tmux session $SESSION" >&2; rc=1; }; fi
else
  echo "no tmux session $SESSION"
fi

# 2. board comments
echo "board #$BOARD in $REPO, comments since $SINCE:"
all="$(gh api --paginate "repos/$REPO/issues/$BOARD/comments?per_page=100&since=$SINCE" --jq '.[] | {id, t: .created_at, u: .user.login, b: .body}')" \
  || die "could not read the comments of #$BOARD in $REPO; nothing deleted. Rerun demo/reset.sh when gh works"
ours="$(printf '%s\n' "$all" | jq -rs --arg mark "$DEMO_MARK" --arg since "$SINCE" '
  map(select(.t >= $since)) as $c
  | ([$c[] | select(.b | test($mark)) | .b | scan("\\(req ([0-9a-f]+)\\)") | .[0]] | unique) as $ids
  | $c[] | select((.b | test($mark)) or (($ids | length) > 0 and (.b | test("\\breq\\s+(" + ($ids | join("|")) + ")\\b"; "i"))))
  | [.id, .t, .u, (.b | gsub("\\s+"; " ") | sub(" ?<!--.*$"; "") | .[0:110])] | @tsv')" || die "could not parse the comments; nothing deleted"
n=0
if [ -n "$ours" ]; then
  while IFS=$'\t' read -r id t u body; do
    if [ "$DRY" = 1 ]; then echo "would delete $id  $t  $u  $body"; n=$((n + 1)); continue; fi
    if gh api -X DELETE "repos/$REPO/issues/comments/$id" >/dev/null 2>&1; then echo "deleted $id  $t  $u  $body"; n=$((n + 1))
    else echo "demo: FAILED to delete comment $id ($t $u)" >&2; rc=1; fi
  done <<< "$ours"
fi
echo "$n demo comment(s) $([ "$DRY" = 1 ] && echo found || echo deleted) on #$BOARD"

# 3. scratch repos, kept (with the state file) if a comment could not be deleted so a rerun still knows what to clean
if [ "$DRY" = 1 ]; then
  [ -e "$DEMO_DIR" ] && echo "would delete $DEMO_DIR" || echo "no $DEMO_DIR"
elif [ "$rc" = 0 ]; then
  if [ -e "$DEMO_DIR" ]; then rm -rf "$DEMO_DIR" && echo "deleted $DEMO_DIR" || { echo "demo: could not delete $DEMO_DIR" >&2; rc=1; }; else echo "no $DEMO_DIR"; fi
  rm -f "$STATE" || rc=1
  [ ! -e "$DEMO_DIR" ] && [ ! -e "$STATE" ] && ! tmux has-session -t "$SESSION" 2>/dev/null && echo "clean: no tmux session, no scratch repos, no state file"
else
  echo "demo: some steps failed, scratch repos and the state file are kept; rerun demo/reset.sh" >&2
fi
exit "$rc"
