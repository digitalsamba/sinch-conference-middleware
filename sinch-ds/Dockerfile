# syntax=docker/dockerfile:1
# Node 24 LTS, pinned by digest (Dependabot's docker ecosystem bumps both lines).

# --- deps: production node_modules only, resolved from the lockfile ---
FROM node:26-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913 AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# --- runtime ---
FROM node:26-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913
ENV NODE_ENV=production \
    PORT=3030 \
    PIN_MAP_FILE=/config/pins.json

WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Run as the image's unprivileged `node` user (uid 1000). The app writes nothing to
# disk: the PIN map is mounted read-only at /config/pins.json, call state is in memory.
USER node

EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3030)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.js"]
