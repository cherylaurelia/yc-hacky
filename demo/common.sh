# shellcheck shell=bash
# Shared by demo/run.sh and demo/reset.sh. Sourced, not run.
DEMO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="${COWORKER_DEMO_DIR:-/tmp/coworker-demo}"
SESSION="${COWORKER_DEMO_SESSION:-coworker-demo}"
STATE="$DEMO_DIR.state"                       # JSON: board, repo, since. Lives beside the repos so reset can read it first.
# Every post the demo's agents make names its scratch repo ("... in demo-storefront", or a /coworker-demo/ cwd in a
# context block). That is how reset.sh tells demo posts from a teammate's real ones on the same board.
DEMO_MARK='(demo-(storefront|payments-api|docs-site)\b|/coworker-demo/)'

die() { echo "demo: $*" >&2; exit 1; }
is_num() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ]; }
valid_repo() { [[ "$1" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; }
need() { local c; for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "$c not found on PATH"; done; }

# owner/name of the board repo: $COWORKER_REPO, else origin of the checkout this script lives in
board_repo() {
  local r="${COWORKER_REPO:-}"
  [ -n "$r" ] || r="$(git -C "$DEMO_ROOT" remote get-url origin 2>/dev/null | sed -E 's#^(git@[^:]+:|https?://[^/]+/|ssh://[^/]+/)##; s#\.git$##')"
  valid_repo "$r" || die "cannot work out the board repo; set COWORKER_REPO=owner/name"
  printf '%s' "$r"
}
