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

`maritime agents upload-source <zip>` prints an `s3Key`. Then `maritime deployments create --body-json '{"agentId":"<id>","source":"zip","uploadS3Key":"<s3Key>"}'` rebuilds the agent in place with the same id and URL. Measured on `coworker-worker`: 3 min 50 s from the call to `active`, and `/data` survives. `maritime exec` answers 409 while it deploys. This was not tried on `coworker`. With the GitHub App installed, `maritime deploy coworker --source github --repo <url> --wait` works. Re-creating the agent changes the URL and breaks the OAuth callback.

## Worker agent

A second agent, `coworker-worker` (id `297ee269-1b71-4898-8edb-2a14b79c89ae`, private, `tier: always_on`), runs `scripts/board-worker.sh` in loop mode. A board post containing `TASK for Cheryl's Claude:` is handled with the laptop closed: the agent posts `on it`, runs a headless Claude Code in a fresh worktree, opens a PR, and posts `done: <title>, PR #N`. The flow is in `docs/worker.md`.

Why a loop and not a webhook-woken one-shot: the agent is always-on, so it never sleeps between tasks. The loop costs one GitHub call every 10 s and needs no webhook on the repo. A webhook (`POST api.maritime.sh/api/webhooks/<agent id>?token=`) only pays off for an agent that sleeps.

Measured on the scratch board (#4, `WORKER_PR_PREFIX='[demo] '`): the `on it` post came 4 s after the task post, and the PR plus the `done` post 72 to 77 s after `on it` (`npm ci` about 15 s, Claude about 60 s, the worker's own `npm run build` about 12 s). 3 of 4 runs opened a PR. See the known issue below.

### What runs

`worker/` holds the source. `worker/pack.sh <zip>` builds the ZIP, because Maritime needs a `Dockerfile` at the ZIP root and the app's own `Dockerfile` cannot be reused.

- `Dockerfile`: `node:24-slim` plus `git`, `gh`, `jq`, `perl`, `coreutils`, and `@anthropic-ai/claude-code@2.1.330`. `CMD ["node", "start.cjs"]`.
- `start.cjs`: runs as root only to add `127.0.0.1 localhost` to `/etc/hosts` (`npm run build` needs it), to create `/dev/fd`, `/dev/stdin`, `/dev/stdout` and `/dev/stderr` (the VM has none, so bash `<(...)` in the worker fails silently and nothing is ever handled), and to own `/data`. It serves `GET /health` and `POST /chat` (any message returns the worker status and the last 25 log lines), runs `boot.sh` as `node`, and restarts it after 30 s if it exits.
- `boot.sh`: clones the repo to `/data/repo` on first boot, copies the image's `scripts/board-worker.sh` and `tools/board` over the clone so a deploy pins the worker version, runs `--baseline` once per board issue so old tasks are not replayed, then runs the loop.

On `/data`: `/data/repo/.board/worker-handled` (handled comment ids, so a restart does not redo a task), `/data/repo/.board/baselined-<issue>`, `/data/board-worker` (worktrees and logs), `/data/.claude`, `/data/.npm`. Each task's `node_modules` is deleted after the task (`WORKER_CLEAN_NODE_MODULES=1`), so the 5 GB disk does not fill.

The VM defaults to 2.5 GB RAM and 1 vCPU. `npm run build` passed on that. `memMb` and `vcpus` can only be set at `agents create`.

### Env (names only)

| Name | Secret | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude Code |
| `WORKER_GITHUB_TOKEN` | yes | fine-grained PAT on the repo: Contents, Pull requests, Issues read and write. `boot.sh` exports it as `GH_TOKEN`. Never `gh auth token` |
| `BOARD_ISSUE` | no | board issue number, default 1 |
| `BOARD_REPO` | no | `owner/name`, default `cherylaurelia/yc-hacky` |
| `WORKER_PR_PREFIX` | no | e.g. `[demo] ` in front of every PR title, for tests. Unset on the real board |
| `WORKER_TIMEOUT`, `WORKER_MODEL`, `WORKER_BUDGET_USD`, `WORKER_INTERVAL` | no | as in `docs/worker.md`. `boot.sh` defaults the timeout to 420 s |

### Deploy (what was run)

```
worker/pack.sh /tmp/mar-worker/coworker-worker.zip
maritime agents create --name coworker-worker --from-dir /tmp/mar-worker/coworker-worker.zip --idle-ttl-seconds 0
maritime env import coworker-worker <file holding only ANTHROPIC_API_KEY and WORKER_GITHUB_TOKEN>
maritime env set coworker-worker BOARD_REPO=cherylaurelia/yc-hacky BOARD_ISSUE=1 --no-secret
```

Do not `env import` all of `~/.yc-hacky.env`: it holds the web app's other secrets.

### Logs, status, stop

```
maritime chat coworker-worker "status"     # running or stopped, restarts, last 25 worker log lines
maritime exec <id> --body-json '{"command":"tail -n 50 /data/board-worker/logs/*/*/*.claude.log"}'
maritime logs coworker-worker              # platform events only (Deploying container, Agent deployed and running)
maritime status coworker-worker --json
maritime stop coworker-worker              # stops it; maritime start coworker-worker resumes it
maritime env set coworker-worker BOARD_ISSUE=4 --no-secret && maritime restart coworker-worker
```

`maritime logs` does not carry the worker's stdout, so use `chat status` or `exec`. `env set --reload` did not restart the process in a test (the worker kept the old `BOARD_ISSUE`), so run `maritime restart` after any env change. A new `BOARD_ISSUE` is baselined on that boot. Only one worker should watch a board: stop any laptop `scripts/board-worker.sh` first, or two loops race on the same post.

### Known issue

Headless Claude Code is denied some commands by the `--allowedTools` rules, and the denial is not deterministic. Over 4 runs, 1 ended `blocked: no PR was opened` (Claude reported its push was denied, and the same push passed when rerun alone), and 1 PR body lost its `##` line breaks because Claude was denied a multi-line `gh pr create`. A blocked task is posted on the board and can be re-posted. A likely fix is to tell Claude in the prompt to keep each command on one line and write the PR body to a file for `--body-file`. This is not done or tested.
