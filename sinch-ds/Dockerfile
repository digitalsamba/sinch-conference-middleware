# syntax=docker/dockerfile:1
# Node 24 LTS, pinned by digest (Dependabot's docker ecosystem bumps both lines).

# --- deps: production node_modules only, resolved from the lockfile ---
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# --- runtime ---
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
ENV NODE_ENV=production \
    PORT=3030 \
    DATABASE_PATH=/data/conference_data.db

WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public

# Run as the image's unprivileged `node` user (uid 1000). The DB lives on a volume
# at /data; /app is kept writable for deployments that bind-mount
# /app/conference_data.db (SQLite also writes its journal next to the file).
RUN mkdir -p /data /app && chown node:node /data /app
USER node
VOLUME ["/data"]

EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3030)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.js"]
