#!/usr/bin/env bash
# Install the Coworker hooks (hooks/coworker-hook.sh) into a Claude Code settings file.
# Merges with jq, keeps every other hook, is idempotent, and is reversible.
#
#   hooks/install.sh [--project] [--uninstall] [SETTINGS_FILE]
#
#   default file  ~/.claude/settings.json      (every session on this machine)
#   --project     ./.claude/settings.local.json (this repo only, not committed)
#   --uninstall   remove our hooks; restores the pre-install file byte for byte when nothing else changed
#
# The hook script is copied to <settings dir>/hooks/. The first install saves the original as
# <file>.bak-precoworker. One command for a teammate (needs gh logged in and jq):
#   gh api repos/cherylaurelia/yc-hacky/contents/hooks/install.sh -H 'Accept: application/vnd.github.raw' | bash
set -u
SRC_REPO="${COWORKER_HOOK_REPO:-cherylaurelia/yc-hacky}"
die() { echo "install: $*" >&2; exit 1; }
command -v jq >/dev/null || die "jq not found (brew install jq)"

S="" PROJECT="" UNINSTALL=""
for a in "$@"; do
  case "$a" in
    --project) PROJECT=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,/^set -u/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown flag $a" ;;
    *) S="$a" ;;
  esac
done
[ -n "$S" ] || { [ -n "$PROJECT" ] && S="$PWD/.claude/settings.local.json" || S="$HOME/.claude/settings.json"; }
DIR="$(cd "$(dirname "$S")" 2>/dev/null && pwd)" || DIR="$(dirname "$S")"
S="$DIR/$(basename "$S")"
BAK="$S.bak-precoworker"
HOOK="$DIR/hooks/coworker-hook.sh"
if [ -n "$PROJECT" ]; then CMD='"$CLAUDE_PROJECT_DIR"/.claude/hooks/coworker-hook.sh'; else CMD="\"$HOOK\""; fi

if [ -e "$S" ]; then
  jq -e 'type == "object" and ((.hooks // {}) | type == "object" and all(.[]; type == "array"))' "$S" >/dev/null 2>&1 \
    || die "$S is not a JSON settings object with a valid hooks section; not touching it"
fi
CUR="$([ -s "$S" ] && cat "$S" || echo '{}')"

# jq helpers: a handler is ours when its command names coworker-hook.sh
LIB='def ours: ((.command // "") | contains("coworker-hook.sh"));
  def purge: [ .[] | if ((.hooks // []) | any(ours)) then (.hooks |= map(select(ours | not))) | select(.hooks | length > 0) else . end ];
  def strip: if .hooks then .hooks |= (with_entries(.value |= purge) | with_entries(select(.value | length > 0))) else . end
    | if .hooks == {} then del(.hooks) else . end;
  def add($ev; $g): .hooks[$ev] = ((.hooks[$ev] // []) + [$g]);'

if [ -n "$UNINSTALL" ]; then
  [ -e "$S" ] || { echo "nothing to uninstall: $S does not exist"; exit 0; }
  NEW="$(printf '%s' "$CUR" | jq "$LIB strip")" || die "jq failed"
  [ "$(printf '%s' "$CUR" | jq -S .)" != "$(printf '%s' "$NEW" | jq -S .)" ] || { echo "the Coworker hooks are not in $S; nothing to do"; exit 0; }
  if [ -e "$BAK" ] && [ "$(jq -S . "$BAK" 2>/dev/null)" = "$(printf '%s' "$NEW" | jq -S .)" ]; then
    cp -p "$BAK" "$S" || die "could not restore $BAK"; echo "restored $S from $BAK"
  elif [ -e "$BAK" ] && [ ! -s "$BAK" ] && [ "$NEW" = "{}" ]; then
    rm -f "$S"; echo "removed $S (it did not exist before the install)"
  else
    printf '%s\n' "$NEW" > "$S" || die "could not write $S"; echo "removed the Coworker hooks from $S"
  fi
  rm -f "$BAK" "$HOOK"; rmdir "$DIR/hooks" 2>/dev/null
  exit 0
fi

# the hook script: next to this file when run from a clone, else from GitHub (the one-command path)
SELF="${BASH_SOURCE[0]:-}"
mkdir -p "$DIR/hooks" || die "cannot create $DIR/hooks"
if [ -n "$SELF" ] && [ -f "$(dirname "$SELF")/coworker-hook.sh" ]; then
  cp "$(dirname "$SELF")/coworker-hook.sh" "$HOOK" || die "cannot copy the hook script"
else
  command -v gh >/dev/null || die "gh not found (https://cli.github.com), then: gh auth login"
  gh api "repos/$SRC_REPO/contents/hooks/coworker-hook.sh" -H 'Accept: application/vnd.github.raw' > "$HOOK.tmp" \
    && [ -s "$HOOK.tmp" ] && mv "$HOOK.tmp" "$HOOK" || { rm -f "$HOOK.tmp"; die "could not fetch hooks/coworker-hook.sh from $SRC_REPO"; }
fi
chmod +x "$HOOK"

NEW="$(printf '%s' "$CUR" | jq --arg cmd "$CMD" "$LIB strip
  | add(\"PermissionRequest\"; {hooks: [{type: \"command\", command: \$cmd, timeout: 120}]})
  | add(\"Notification\"; {matcher: \"idle_prompt|elicitation_dialog\", hooks: [{type: \"command\", command: \$cmd, timeout: 20}]})
  | add(\"Stop\"; {hooks: [{type: \"command\", command: \$cmd, timeout: 20}]})
  | add(\"UserPromptSubmit\"; {hooks: [{type: \"command\", command: \$cmd, timeout: 10}]})")" || die "jq failed"

if [ -e "$S" ] && [ "$NEW" = "$(cat "$S")" ]; then echo "already installed in $S"; exit 0; fi
[ -e "$BAK" ] || { if [ -e "$S" ]; then cp -p "$S" "$BAK"; else : > "$BAK"; fi; } || die "could not write the backup $BAK"
printf '%s\n' "$NEW" > "$S" || die "could not write $S"
jq -e . "$S" >/dev/null || { cp -p "$BAK" "$S"; die "wrote invalid JSON to $S, restored $BAK"; }
echo "installed the Coworker hooks in $S (backup: $BAK)"
echo "next: gh auth login (if needed); set COWORKER_BOARD=<issue> and COWORKER_NAME=<you> to override the defaults; restart Claude Code"
