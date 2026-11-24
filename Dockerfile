# Coworker on Maritime (maritime.sh): Next.js standalone server.
# Maritime injects PORT and forwards public traffic to it. The app keeps no state, so nothing is written to /data.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim
# Slim images ship without CA certs and every call to api.github.com / api.elevenlabs.io would fail.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Standalone leaves public/ out. The /api/version route reads public/releases.json at request time.
COPY --from=build --chown=node:node /app/public ./public
# Maritime's init flattens the CMD into one string, so no `sh -c` and no `node -e` with quotes.
# The VM can set HOSTNAME to its own name, and server.js would bind that instead of every interface.
RUN printf "process.env.HOSTNAME = '0.0.0.0';\nrequire('./server.js');\n" > start.cjs
USER node
CMD ["node", "start.cjs"]
