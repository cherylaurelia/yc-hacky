#!/usr/bin/env bash
# Runs inside the Maritime VM as `node`: put the repo on /data, baseline old tasks once, then loop.
# start.cjs retries this script if it exits.
set -eu
log() { printf '%s [boot] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
need() { [ -n "${!1:-}" ] || { log "$1 is not set. Run: maritime env set <agent> $1=... --reload"; exit 1; }; }
[ -e /dev/fd/0 ] || { log "/dev/fd is missing, so bash process substitution in board-worker.sh fails silently"; exit 1; }
need WORKER_GITHUB_TOKEN
need ANTHROPIC_API_KEY

export GH_TOKEN="$WORKER_GITHUB_TOKEN"
export BOARD_REPO="${BOARD_REPO:-cherylaurelia/yc-hacky}"
export BOARD_ISSUE="${BOARD_ISSUE:-1}"
export WORKER_DIR="${WORKER_DIR:-/data/board-worker}"
export WORKER_TIMEOUT="${WORKER_TIMEOUT:-420}"
export WORKER_CLEAN_NODE_MODULES=1
unset WORKER_GITHUB_TOKEN
REPO_DIR=/data/repo

git config --global user.name "Cheryl's Claude"
git config --global user.email "noreply@anthropic.com"
git config --global credential.https://github.com.helper '!gh auth git-credential'

[ -d "$REPO_DIR/.git" ] || git clone -q "https://github.com/$BOARD_REPO.git" "$REPO_DIR"
cd "$REPO_DIR"
git fetch -q origin main
git checkout -q -f -B main origin/main
git worktree prune
# The image's copy of the worker wins over the clone's, so a deploy pins the version.
cp /app/scripts/board-worker.sh scripts/board-worker.sh
cp /app/tools/board tools/board

mkdir -p .board
if [ ! -e ".board/baselined-$BOARD_ISSUE" ]; then
  log "first boot on issue #$BOARD_ISSUE: baseline, so old TASK posts are not replayed"
  scripts/board-worker.sh --baseline
  touch ".board/baselined-$BOARD_ISSUE"
fi
log "starting the worker on $BOARD_REPO issue #$BOARD_ISSUE"
exec scripts/board-worker.sh
