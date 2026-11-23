#!/usr/bin/env bash
# Product-readiness check for the `product` hill climb. One test per gap between Coworker and a
# Wispr Flow-grade app where agents can talk to you. The score is node:test's "ℹ fail N" line.
# Builds the Mac app first (macos/build.sh), because some tests read the built bundle and DMG.
set -u
cd "$(dirname "$0")/../.."
log="$(mktemp -t coworker-product-build)"
export PRODUCT_RUN_START="$(date +%s)"
if bash macos/build.sh >"$log" 2>&1; then export PRODUCT_BUILD_STATUS=0; else export PRODUCT_BUILD_STATUS=1; fi
export PRODUCT_BUILD_LOG="$log"
out="$(mktemp -t coworker-product-out)"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning \
  --test --test-concurrency=8 --test-reporter=spec tests/product/*.test.ts >"$out" 2>&1
grep -vE '^\s+at ' "$out" | head -n 600
echo "---- summary"
grep -E '^[✔✖] ' "$out" | sort | uniq
[ "$PRODUCT_BUILD_STATUS" = 0 ] || { echo "---- macos/build.sh failed:"; tail -n 30 "$log"; }
summary="$(grep -E '^ℹ (tests|pass|fail) ' "$out")"
rm -f "$out" "$log"
# No summary means node crashed: never let that read as zero failures.
echo "$summary" | grep -qE '^ℹ tests ([4-9][0-9]|[1-9][0-9]{2,})$' || { echo "no test summary (or fewer than 40 tests ran)"; exit 3; }
echo "$summary"
