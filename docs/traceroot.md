# TraceRoot audit trail

Every tool call the coworker makes (`/api/tool/*`: tool, repo, signed-in user, allow/deny/stop decision and request id, result, status, duration) and every board poll that finds an alert or an answer (`/api/board/new`: who, kind, request ids) becomes one `coworker.*` span, so a voice approval can be reviewed later. Server only. Args and alert text are clipped to 500 and 200 characters, and tokens and diffs are never sent.
Env vars: `TRACEROOT_API_KEY` turns it on (no key, no SDK loaded, no spans). Optional: `TRACEROOT_HOST_URL` (default `https://app.traceroot.ai`), `TRACEROOT_ENABLED=false`, `TRACEROOT_ENVIRONMENT`.
Where to look: app.traceroot.ai, your project, Traces. Open `coworker.tool.answer_request` for approvals. The request id is on both the alert span (`coworker.board.alert`, attribute `requests`) and the decision span (attribute `request_id`), so you can follow one alert to the answer.
