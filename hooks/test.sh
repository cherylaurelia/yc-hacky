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
  *" -f body="*)
    for a in "$@"; do case "$a" in body=*) printf '%s\n' "${a#body=}" >> "$FAKE_BODIES" ;; esac; done
    [ -z "${FAKE_POST_FAIL:-}" ] && echo "100 2026-01-01T00:00:00Z" ;;
  *comments*) [ -n "${FAKE_API_FAIL:-}" ] && exit 1; [ -n "${FAKE_API_SLOW:-}" ] && sleep 5; cat "$FAKE_ROWS" 2>/dev/null ;;
esac
EOF
chmod +x "$T/bin/gh"
git -C "$T/repo" init -q && git -C "$T/repo" remote add origin https://github.com/acme/widgets.git && git -C "$T/repo" config user.name "Sam Lee"
export PATH="$T/bin:$PATH" FAKE_LOG="$T/log" FAKE_ROWS="$T/rows" FAKE_BODIES="$T/bodies" COWORKER_STATE_DIR="$T/state" COWORKER_TIMEOUT=3 HOME="$T" TMPDIR="$T/tmp" COWORKER_STOP_EVERY=0
fail=0
ev() { local x="${3:-}"; [ -n "$x" ] || x='{}'; jq -nc --arg e "$1" --arg c "${2:-$T/repo}" --argjson x "$x" '{hook_event_name: $e, cwd: $c, session_id: "s1"} + $x'; }
posts() { grep -c -- ' -f body=' "$T/log" 2>/dev/null || true; }
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2] want [$3]"; fail=1; fi; }
reset() { : > "$T/log"; : > "$T/rows"; : > "$T/bodies"; rm -rf "$T/state" "$T/tmp"; unset FAKE_POST_FAIL FAKE_API_FAIL FAKE_API_SLOW; }
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

# --- the context comment on every post (contract v1)
printf 'one\ntwo\nthree\n' > "$T/repo/a.txt"
lastctx() { grep -o 'coworker:{.*} -->' "$T/bodies" | tail -1 | sed 's/^coworker://; s/ -->$//'; }
reqid() { grep -o 'req [0-9a-f]\{6\}' "$T/log" | head -1 | cut -d' ' -f2; }
reset; ev PermissionRequest "$T/repo" "$(jq -nc --arg f "$T/repo/a.txt" '{tool_name:"Edit",tool_input:{file_path:$f,old_string:"two",new_string:"TWO"}}')" | COWORKER_TIMEOUT=1 "$HOOK"
c="$(lastctx)"
check "approval context: fields" "$(echo "$c" | jq -r '[.v, .kind, .session, .agent, .repo, .tool, .line, (.stuck | type)] | join(" ")')" "1 approval s1 Sam's Claude acme/widgets Edit 2 null"
check "approval context: req matches the post" "$(echo "$c" | jq -r .req)" "$(reqid)"
check "approval context: file and diff" "$(echo "$c" | jq -r '[.file, (.diff | split("\n") | map(select(test("^[-+](two|TWO)$"))) | join(","))] | join(" ")')" "$T/repo/a.txt -two,+TWO"
check "approval context follows the visible line" "$(head -1 "$T/bodies" | cut -c1-31)" "[Sam's Claude] needs approval ("
reset; perm >/dev/null; c="$(lastctx)"
check "bash approval: command, no file, no diff" "$(echo "$c" | jq -c '[.tool, .command, .file, .line, .diff]')" '["Bash","touch a.txt",null,null,null]'
reset; ev PermissionRequest "$T/repo" "$(jq -nc --arg f "$T/repo/new.txt" '{tool_name:"Write",tool_input:{file_path:$f,content:"hello\n"}}')" | COWORKER_TIMEOUT=1 "$HOOK"
check "write approval: diff of a new file" "$(lastctx | jq -r '.diff | split("\n") | map(select(startswith("+hello"))) | length')" 1
reset; ev PermissionRequest "$T/repo" "$(jq -nc --arg f "$T/repo/big.txt" '{tool_name:"Write",tool_input:{file_path:$f,content:([range(2000) | "line \(.) @x token=hunter2"] | join("\n"))}}')" | COWORKER_TIMEOUT=1 "$HOOK"
c="$(lastctx)"
check "context stays under 6000 chars, diff under 3000" "$([ "${#c}" -lt 6000 ] && echo "$c" | jq -r '(.diff | length) <= 3000')" true
check "no @ < > or secret in the comment" "$(grep -c 'hunter2\|@x' "$T/bodies"):$(echo "$c" | grep -c '[@<>]')" "0:0"
reset; ev Notification "$T/repo" '{"notification_type":"idle_prompt","message":"waiting"}' | "$HOOK"
check "blocked context" "$(lastctx | jq -c '[.kind, .req, .tool, .command, .agent]')" '["blocked",null,null,"","Sam'"'"'s Claude"]'
reset; ev UserPromptSubmit | "$HOOK"; echo $(( $(date +%s) - 100 )) > "$T/state/s1.start"; ev Stop "$T/repo" '{"last_assistant_message":"Shipped."}' | "$HOOK"
check "done context" "$(lastctx | jq -c '[.kind, .req, .repo]')" '["done",null,"acme/widgets"]'

# --- stuck loop: the same command failing COWORKER_STUCK_COUNT times
fail_ev() { ev PostToolUseFailure "$T/repo" "$(jq -nc --arg c "$1" --arg t "${2:-}" '{tool_name:"Bash",tool_input:{command:$c},error:"Exit code 1\nboom",transcript_path:$t}')"; }
ok_ev() { ev PostToolUse "$T/repo" "$(jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c},tool_response:{stdout:"ok",stderr:"",interrupted:false}}')"; }
reset; fail_ev "node --test 2>&1 | tail -5" | "$HOOK"; fail_ev "node --test" | "$HOOK"; check "two failures post nothing" "$(posts)" 0
fail_ev "node --test" | "$HOOK"; check "the third failure posts once" "$(posts)" 1
grep -q "stuck: retried node --test 3 times in 1 min (req [0-9a-f]\{6\})" "$T/bodies" && check "stuck text, no cost without a transcript" 1 1 || check "stuck text, no cost without a transcript" 0 1
check "stuck context" "$(lastctx | jq -c '[.kind, .tool, .command, .stuck]')" '["stuck","Bash","node --test",{"count":3,"minutes":1,"cost_usd":null,"signature":"node --test"}]'
check "stuck req matches the post" "$(lastctx | jq -r .req)" "$(reqid)"
for _ in 1 2; do fail_ev "node --test" | "$HOOK"; done; check "one post per signature" "$(posts)" 1
for _ in 1 2 3; do fail_ev "npm run lint" | "$HOOK"; done; check "another signature posts its own" "$(posts)" 2
reset; for c in F F S F F S F; do if [ $c = F ]; then fail_ev "make test" | "$HOOK"; else ok_ev "make test" | "$HOOK"; fi; done
check "successes in between: no trigger" "$(posts)" 0
fail_ev "make test" | "$HOOK"; fail_ev "make test" | "$HOOK"; check "three in a row after the last success: trigger" "$(posts)" 1
reset; mkdir -p "$T/tmp/coworker"; h="$(printf x | cksum | cut -d' ' -f1)"; printf 'F %s 1\nF %s 2\n' "$h" "$h" > "$T/tmp/coworker/s1"; fail_ev "x" | "$HOOK"
check "failures older than the window do not count" "$(posts)" 0
reset; ev PostToolUseFailure "$T/repo" '{"tool_name":"Bash","tool_input":{"command":"x"},"is_interrupt":true}' | "$HOOK"; check "an interrupt is not a failure" "$(cat "$T/tmp/coworker/s1" 2>/dev/null | wc -l | tr -d ' ')" 0
# cost from the transcript: two assistant messages, each written twice, opus 5.5 and sonnet 5.5
{ jq -nc '{type:"user",message:{role:"user",content:"hi"}}'
  jq -nc '{type:"assistant",message:{id:"a",model:"claude-opus-5-5",usage:{input_tokens:1000000,output_tokens:1,cache_read_input_tokens:2000000}}}'
  jq -nc '{type:"assistant",message:{id:"a",model:"claude-opus-5-5",usage:{input_tokens:1000000,output_tokens:100000,cache_read_input_tokens:2000000}}}'
  jq -nc '{type:"assistant",message:{id:"b",model:"claude-sonnet-5-5",usage:{input_tokens:500000,output_tokens:0,cache_creation_input_tokens:1000000,cache_creation:{ephemeral_5m_input_tokens:1000000,ephemeral_1h_input_tokens:0}}}}'
  echo 'not json'; } > "$T/transcript.jsonl"
reset; for _ in 1 2 3; do fail_ev "pytest" "$T/transcript.jsonl" | "$HOOK"; done
grep -q "in 1 min, about \$9.90 so far (req" "$T/bodies" && check "cost estimate from the transcript (4/20 opus, 2/10 sonnet)" 1 1 || check "cost estimate from the transcript" 0 1
check "cost in the context" "$(lastctx | jq -r '.stuck.cost_usd == 9.9')" true
reset; for _ in 1 2 3; do fail_ev "pytest" "$T/missing.jsonl" | "$HOOK"; done
grep -q "about" "$T/bodies" && check "no transcript: no dollar part" 0 1 || check "no transcript: no dollar part" 1 1

# --- stop by voice
pre() { ev "${1:-PreToolUse}" "$T/repo" '{"tool_name":"Bash","tool_input":{"command":"ls"}}'; }
stuck3() { for _ in 1 2 3; do fail_ev "node --test" | "$HOOK"; done; }
reset; stuck3; reply cheryl "[Sam's Coworker] req $(reqid) stop"
out="$(pre | "$HOOK")"
check "stop reply: continue false with the reason" "$(echo "$out" | jq -c '[.continue, .stopReason]')" '[false,"Stopped by Sam via Coworker: stuck retrying node --test"]'
check "the stop is delivered once" "$(pre | "$HOOK")" ""
reset; stuck3; reply cheryl "req $(reqid) stop"; check "PostToolUseFailure never stops (Claude Code ignores it there)" "$(fail_ev "node --test" | "$HOOK")" ""
check "the stop waits for the next Pre/PostToolUse" "$(pre | "$HOOK" | jq -r .continue)" false
reset; stuck3; reply Cheryl "req $(reqid) STOP it"; check "PostToolUse also stops, login case ignored" "$(pre PostToolUse | "$HOOK" | jq -r .continue)" false
reset; stuck3; reply mallory "req $(reqid) stop"; check "stop from a stranger is ignored" "$(pre | "$HOOK")" ""
reset; stuck3; reply cheryl "req ffffff stop"; check "stop for another req is ignored" "$(pre | "$HOOK")" ""
reset; stuck3; reply cheryl "req $(reqid) allow"; check "an allow reply is not a stop" "$(pre | "$HOOK")" ""
reset; stuck3; reply cheryl "req $(reqid) stop"; check "COWORKER_APPROVERS replaces the gh user" "$(pre | COWORKER_APPROVERS=alice "$HOOK")" ""
reset; stuck3; reply cheryl "req $(reqid) stop"; FAKE_API_FAIL=1; export FAKE_API_FAIL
check "board error fails open" "$(pre | "$HOOK")" ""; unset FAKE_API_FAIL
reset; stuck3; reply cheryl "req $(reqid) stop"; FAKE_API_SLOW=1; export FAKE_API_SLOW; s=$(date +%s); out="$(pre | "$HOOK")"
check "slow board: no stop, tool call held under 3 s" "$out/$(( $(date +%s) - s < 3 ))" "/1"; unset FAKE_API_SLOW
reset; stuck3; pre | COWORKER_STOP_EVERY=100 "$HOOK"; n0="$(grep -c per_page "$T/log")"; pre | COWORKER_STOP_EVERY=100 "$HOOK"; pre | COWORKER_STOP_EVERY=100 "$HOOK"
check "board is checked at most once per interval" "$(( $(grep -c per_page "$T/log") - n0 ))" 0
pre | "$HOOK"; check "an elapsed interval checks again" "$(( $(grep -c per_page "$T/log") - n0 ))" 1
reset; fail_ev "x" | "$HOOK"; pre | "$HOOK"; check "no req posted: no board call" "$(grep -c per_page "$T/log")" 0
reset; check "no state: Pre/PostToolUse exit at once" "$(pre | "$HOOK")$(pre PostToolUse | "$HOOK")$(wc -c < "$T/log" | tr -d ' ')" 0
reset; perm >/dev/null; reply cheryl "req $(reqid) stop"; check "stop works for an approval req too" "$(pre | "$HOOK" | jq -r .stopReason)" "Stopped by Sam via Coworker: waiting on approval"

# --- install.sh: new events, idempotent, uninstall byte for byte
INST="$(cd "$(dirname "$HOOK")" && pwd)/install.sh"; S="$T/inst/settings.json"; mkdir -p "$T/inst"
printf '{\n  "theme": "dark",\n  "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo mine"}]}]}\n}\n' > "$S"; cp "$S" "$T/inst/orig"
"$INST" "$S" >/dev/null; check "install adds the tool events" "$(jq -r '.hooks | keys | join(",")' "$S")" "Notification,PermissionRequest,PostToolUse,PostToolUseFailure,PreToolUse,Stop,UserPromptSubmit"
check "install keeps other hooks" "$(jq -r '.hooks.Stop | length' "$S")" 2
cp "$S" "$T/inst/once"; "$INST" "$S" >/dev/null; check "install twice changes nothing" "$(cmp -s "$S" "$T/inst/once" && echo same)" same
"$INST" --uninstall "$S" >/dev/null; check "uninstall restores the file byte for byte" "$(cmp -s "$S" "$T/inst/orig" && echo same)" same
exit $fail
