#!/usr/bin/env bash
# Unit-checks the push-to-talk state machine for every talk key and the pill state machine (pure logic, no keyboard needed).
set -euo pipefail
cd "$(dirname "$0")"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
swiftc -parse-as-library -swift-version 5 Coworker/Ptt.swift test/ptt-logic-test.swift -o "$out/ptt-logic-test"
"$out/ptt-logic-test"
swiftc -parse-as-library -swift-version 5 Coworker/Pill.swift test/pill-logic-test.swift -o "$out/pill-logic-test"
"$out/pill-logic-test"
swiftc -parse-as-library -swift-version 5 Coworker/License.swift test/license-logic-test.swift -o "$out/license-logic-test"
"$out/license-logic-test"
