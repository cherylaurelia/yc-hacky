#!/usr/bin/env bash
# Runs e2e/flows.ts against a dev server on :3600 (see the header of flows.ts). Last line: failed=N.
set -u
cd "$(dirname "$0")/.."
set -a; . "${YC_ENV:-$HOME/.yc-hacky.env}"; set +a
if ! curl -fsS -o /dev/null --max-time 20 "${E2E_BASE:-http://localhost:3600}/"; then
  echo "dev server is not answering on ${E2E_BASE:-http://localhost:3600}"; echo "failed=99"; exit 0
fi
exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/flows.ts
