#!/usr/bin/env bash
# Serve a production build of the app on port 3800 with NO paid-API keys.
# `env -i` drops every inherited variable (ElevenLabs, TraceRoot, Anthropic), so voice, TTS and tracing
# fail closed. Only free GitHub reads and writes to the demo repo are allowed.
# DEMO_REPOS is a plain allow-list (not a key): the repo is private, and without it the server asks for a GitHub sign-in.
# Run from the repo root after `npm ci && npm run build`.
set -euo pipefail
token="$(gh auth token)"
[ -n "$token" ] || { echo "gh is not logged in" >&2; exit 1; }
exec env -i PATH="$PATH" HOME="$HOME" GITHUB_TOKEN="$token" WRITE_REPOS=cherylaurelia/yc-hacky DEMO_REPOS=cherylaurelia/yc-hacky npm start -- -p 3800
