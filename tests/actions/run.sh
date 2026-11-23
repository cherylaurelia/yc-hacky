#!/usr/bin/env bash
# Check for the `actions` hill climb: the voice coworker can act on GitHub and start agents. Score = "ℹ fail N".
set -u
cd "$(dirname "$0")/../.."
out="$(mktemp -t coworker-actions-out)"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --import ./tests/actions/resolve.ts \
  --test --test-concurrency=6 --test-reporter=spec tests/actions/*.test.ts >"$out" 2>&1
grep -vE '^\s+at ' "$out" | head -n 500
echo "---- summary"
grep -E '^[✔✖] ' "$out" | sort | uniq
summary="$(grep -E '^ℹ (tests|pass|fail) ' "$out")"
rm -f "$out"
# No summary means node crashed: never let that read as zero failures.
echo "$summary" | grep -qE '^ℹ tests (1[5-9]|[2-9][0-9])$' || { echo "no test summary (or fewer than 15 tests ran)"; exit 3; }
echo "$summary"
