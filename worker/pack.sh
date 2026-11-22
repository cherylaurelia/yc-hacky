#!/usr/bin/env bash
# Build the ZIP that Maritime builds the worker agent from (a Dockerfile must sit at the ZIP root).
# Usage: worker/pack.sh <out.zip>
set -eu
out="${1:?usage: worker/pack.sh <out.zip>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/tools"
cp "$root/worker/Dockerfile" "$root/worker/start.cjs" "$root/worker/boot.sh" "$tmp/"
cp "$root/scripts/board-worker.sh" "$tmp/scripts/"
cp "$root/tools/board" "$tmp/tools/"
rm -f "$out"
(cd "$tmp" && zip -qr "$(cd "$(dirname "$out")" && pwd)/$(basename "$out")" .)
unzip -l "$out"
