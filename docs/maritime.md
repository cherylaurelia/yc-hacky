# Coworker on Maritime

Live: https://40984690-ad84-41e4-86fe-718bb67011bb.mtm.sh/ (agent `coworker`, id `40984690-ad84-41e4-86fe-718bb67011bb`, public, Growth plan).
`https://api.maritime.sh/a/<id>/` also answers, but its `/_next/...` assets 404, so share the `mtm.sh` URL.

## How it is built

`Dockerfile` is a three-stage `node:24-slim` build of Next's `output: "standalone"`. It runs as `node`, never root. Maritime injects `PORT` (18789) and forwards 8080 to it. `start.cjs` forces `HOSTNAME=0.0.0.0` because the VM may set its own hostname, and the CMD stays in exec form because Maritime flattens it. The app writes nothing, so it uses no `/data`. `.dockerignore` is honored for repo builds only. ZIP builds skip it, so trim the ZIP yourself.

Checked locally with `docker build` and `docker run -e PORT=18789`, with an empty `/etc/hosts` and a foreign hostname. `/` returns 200, a `repo_overview` tool call returns a result, and `/api/convai-token` returns 200.

## Deploy (what was run)

The repo is private. Maritime reads private repos only through its GitHub App (Settings, GitHub) or GitHub OAuth, so this deploy uploads a ZIP and needs no GitHub click.

```
npx -y maritime-cli@2.8.0 onboard --json            # human approves the device code and adds a card
git archive --format=zip -o /tmp/mar-src/coworker.zip HEAD -- . ':(exclude)macos' ':(exclude)qa' ':(exclude)demo' ':(exclude)design' ':(exclude)docs' ':(exclude)hooks'
maritime agents create --name coworker --from-dir /tmp/mar-src/coworker.zip
maritime env import coworker ~/.yc-hacky.env        # ELEVENLABS_API_KEY SESSION_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET (secret by default)
maritime env set coworker TRUST_PROXY=1 --no-secret --reload
maritime agents url visibility <id> public
echo '{"exposedPort": 8080, "hasWebUi": true}' | maritime agents update <id> --stdin
```

`agents create --from-dir` does not take `--public` or `--port`, so the last two commands are needed. Without `exposedPort` the public URL answers 409 "no exposed_port". The `mtm.sh` host returned 404 for about a minute after the port was set.

With a GitHub App install, the one-liner is `maritime create coworker --repo https://github.com/cherylaurelia/yc-hacky --public`. Do not pass `--port`.

`TRUST_PROXY=1` is safe here. A request with 14 different spoofed `X-Forwarded-For` values still hit the `/api/convai-token` limit after 11, so the last entry is the one Maritime's proxy appends.

## GitHub sign-in on the deployed URL

The OAuth app in `~/.yc-hacky.env` has a `localhost:3000` callback. Register a second OAuth app with:

- Homepage URL: `https://40984690-ad84-41e4-86fe-718bb67011bb.mtm.sh`
- Authorization callback URL: `https://40984690-ad84-41e4-86fe-718bb67011bb.mtm.sh/api/auth/callback`

Then `maritime env set coworker GITHUB_CLIENT_ID=<new id> GITHUB_CLIENT_SECRET=<new secret> --reload`. Keep `SESSION_SECRET`.

## GitHub rate limit without a server token

`lib/github.ts` sends the OAuth app's `client_id:client_secret` as Basic auth on GETs when no token is set. GitHub documents this for public data. Measured with the app in `~/.yc-hacky.env`: 60 an hour anonymous, 5,000 an hour with the credentials. It cannot see private repos or write, so those still need a user token. Never use `gh auth token` as `GITHUB_TOKEN` in the cloud.

## Redeploy

The schema has `DeployCreate.uploadS3Key`, so `maritime agents upload-source <zip>` plus `maritime deployments create --body-json '{"agentId":"<id>","uploadS3Key":"<key>", ...}'` should rebuild in place. This was not tried, and the `source` value is unknown. With the GitHub App installed, `maritime deploy coworker --source github --repo <url> --wait` works. Re-creating the agent changes the URL and breaks the OAuth callback.

## Board worker: not deployed

Skipped, needs `ANTHROPIC_API_KEY` (and a scoped `GITHUB_TOKEN` with push and PR rights on the repo). `~/.yc-hacky.env` has neither. Maritime allows one Dockerfile per repo root and no build targets, so the worker needs a second agent. Steps:

1. Create a small repo, or a ZIP, with a Dockerfile that installs `claude`, `gh`, `git`, `perl`, `coreutils` and this repo's `scripts/board-worker.sh` and `tools/board`, runs as non-root, and starts a long-lived process. The worker script is a loop, so `CMD ["bash", "scripts/board-worker.sh"]` works, and `/health` and `/chat` are only needed if you want to chat to it.
2. `maritime agents create --name board-worker --from-dir <zip> --idle-ttl-seconds 0` for always-on.
3. `maritime env set board-worker ANTHROPIC_API_KEY=... GH_TOKEN=... BOARD_REPO=cherylaurelia/yc-hacky WORKER_DIR=/data/board-worker --reload`.
4. Add `127.0.0.1 localhost` to `/etc/hosts` at start, since the VM's is empty and `npm run build` fails without it. That needs root, so run the worker as root or skip `npm run build` in the worker.
5. Run `scripts/board-worker.sh --baseline` once before starting the loop.
