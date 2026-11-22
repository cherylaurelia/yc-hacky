# Coworker board worker as an always-on Maritime agent (docs/maritime.md, "Worker agent").
# Build context is the ZIP made by worker/pack.sh: this file, start.cjs, boot.sh, scripts/board-worker.sh, tools/board.
FROM node:24-slim
# Slim images ship without CA certs and every call to api.github.com / api.anthropic.com would fail.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git gh jq perl coreutils \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code@2.1.330 \
    && claude --version && gh --version | head -1
WORKDIR /app
COPY start.cjs boot.sh ./
COPY scripts/board-worker.sh scripts/board-worker.sh
COPY tools/board tools/board
RUN chmod +x boot.sh scripts/board-worker.sh tools/board
ENV NEXT_TELEMETRY_DISABLED=1
# start.cjs runs as root only to fix /etc/hosts and /data, then runs the worker as `node`.
# Maritime flattens the CMD into one string, so it stays a bare exec-form program.
CMD ["node", "start.cjs"]
