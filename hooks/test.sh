#!/usr/bin/env bash
# Offline test for hooks/coworker-hook.sh: a fake `gh` on PATH, no network. Run: hooks/test.sh
set -u
HOOK="$(cd "$(dirname "$0")" && pwd)/coworker-hook.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/repo"
cat > "$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$*" in
  "api user"*) echo cheryl ;;
  *" -f body="*) [ -z "${FAKE_POST_FAIL:-}" ] && echo "100 2026-01-01T00:00:00Z" ;;
  *comments*) cat "$FAKE_ROWS" 2>/dev/null ;;
esac
EOF
chmod +x "$T/bin/gh"
git -C "$T/repo" init -q && git -C "$T/repo" remote add origin https://github.com/acme/widgets.git && git -C "$T/repo" config user.name "Sam Lee"
export PATH="$T/bin:$PATH" FAKE_LOG="$T/log" FAKE_ROWS="$T/rows" COWORKER_STATE_DIR="$T/state" COWORKER_TIMEOUT=3 HOME="$T"
fail=0
ev() { local x="${3:-}"; [ -n "$x" ] || x='{}'; jq -nc --arg e "$1" --arg c "${2:-$T/repo}" --argjson x "$x" '{hook_event_name: $e, cwd: $c, session_id: "s1"} + $x'; }
posts() { grep -c -- ' -f body=' "$T/log" 2>/dev/null || true; }
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi; }
reset() { : > "$T/log"; : > "$T/rows"; rm -rf "$T/state"; unset FAKE_POST_FAIL; }
reply() { jq -nc --arg u "$1" --arg b "$2" '{id: 101, u: $u, b: $b}' > "$T/rows"; }
perm() { ev PermissionRequest "$T/repo" '{"tool_name":"Bash","tool_input":{"command":"touch a.txt"}}' | "$HOOK"; }

reset; perm >/dev/null; grep -q "needs approval (req [0-9a-f]\{6\}): Bash touch a.txt in widgets" "$T/log" && check "post text and repo name" 1 1 || check "post text and repo name" 0 1
grep -q "acme/widgets/issues/1/comments" "$T/log" && check "defaults to repo origin, issue 1" 1 1 || check "defaults to repo origin, issue 1" 0 1
grep -q "body=\[Sam's Claude\]" "$T/log" && check "name from git user.name first word" 1 1 || check "name from git user.name first word" 0 1

# a reply needs the request id, so read the id our post used, then feed the reply while the hook polls
run_reply() { # $1 login, $2 body template with ID
  reset; ( sleep 1; id="$(grep -o 'req [0-9a-f]\{6\}' "$T/log" | head -1 | cut -d' ' -f2)"; reply "$1" "${2//ID/$id}" ) & perm; wait
}
check "allow reply returns allow" "$(run_reply cheryl "[Cheryl's Coworker] req ID allow go on" | jq -r .hookSpecificOutput.decision.behavior)" allow
out="$(run_reply Cheryl "req ID DENY wrong folder")"
check "deny reply returns deny" "$(echo "$out" | jq -r .hookSpecificOutput.decision.behavior)" deny
check "deny carries the note" "$(echo "$out" | jq -r .hookSpecificOutput.decision.message)" "Denied by voice from the coworker: wrong folder"
check "reply from a stranger is ignored (timeout, no output)" "$(run_reply mallory "req ID allow")" ""
check "reply for another id is ignored" "$(run_reply cheryl "req ffffff allow")" ""
check "no reply: silent fallback" "$( reset; perm )" ""
reset; export FAKE_POST_FAIL=1; s=$(date +%s); out="$(perm)"; check "post failure: silent and fast" "$out/$(( $(date +%s) - s < 3 ))" "/1"; unset FAKE_POST_FAIL
reset; check "AskUserQuestion is not relayed" "$(ev PermissionRequest "$T/repo" '{"tool_name":"AskUserQuestion","tool_input":{}}' | "$HOOK")$(posts)" "0"
reset; check "no repo: silent, no gh call" "$(ev PermissionRequest "$T" '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | "$HOOK")$(wc -c < "$T/log" | tr -d ' ')" "0"
reset; check "secrets are masked in the post" "$(ev PermissionRequest "$T/repo" '{"tool_name":"Bash","tool_input":{"command":"curl -H \"Authorization: Bearer abc123\" x ghp_SECRET"}}' | COWORKER_TIMEOUT=1 "$HOOK"; grep -c 'abc123\|SECRET' "$T/log")" "0"
reset; ev PermissionRequest "$T/repo" '{"tool_name":"Bash","tool_input":{"command":"npm i @types/node"}}' | COWORKER_TIMEOUT=1 "$HOOK"
check "@mentions in commands are defused" "$(grep -c $'@\xe2\x80\x8btypes' "$T/log")" 1

reset; ev Notification "$T/repo" '{"notification_type":"permission_prompt","message":"x"}' | "$HOOK"; check "permission_prompt notification skipped" "$(posts)" 0
reset; ev Notification "$T/repo" '{"notification_type":"idle_prompt","message":"Claude is waiting for your input."}' | "$HOOK"
grep -q "blocked: Claude is waiting for your input in widgets" "$T/log" && check "idle notification posts blocked" 1 1 || check "idle notification posts blocked" 0 1
reset; ev UserPromptSubmit | "$HOOK"; echo $(( $(date +%s) - 100 )) > "$T/state/s1.start"
ev Stop "$T/repo" '{"last_assistant_message":"\n\nShipped the login fix.\nMore detail.","stop_hook_active":false}' | "$HOOK"
grep -q "done: Shipped the login fix in widgets" "$T/log" && check "long turn posts done with first line" 1 1 || check "long turn posts done with first line" 0 1
ev Notification "$T/repo" '{"notification_type":"idle_prompt","message":"idle"}' | "$HOOK"; check "no idle post right after done" "$(posts)" 1
ev Stop "$T/repo" '{"last_assistant_message":"again"}' | "$HOOK"; check "second Stop without a prompt posts nothing" "$(posts)" 1
reset; ev UserPromptSubmit | "$HOOK"; ev Stop "$T/repo" '{"last_assistant_message":"quick"}' | "$HOOK"; check "short turn posts nothing" "$(posts)" 0
exit $fail
