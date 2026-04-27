# Match the existing yad2-crawler base image — Playwright + Chromium
# with all the system deps already installed. Per CLAUDE.md, the
# production deploy uses this exact image so the watcher and the CRM
# backend (which also runs Playwright via crawlAgency) share a stable
# Chromium version.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

# Install xvfb so we can run Chromium HEADFUL (with a real GPU/screen
# surface) inside a headless container. "Are you headless?" is one of
# the most reliable bot signals — Reblaze hashes navigator.webdriver,
# WebGL renderer, screen.orientation and similar window-only APIs that
# all return tells in pure-headless mode. xvfb-run gives Chromium a
# virtual display so it stops looking automated.
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/market-metadata-watcher/package*.json ./
RUN npm install --omit=optional

COPY services/market-metadata-watcher/tsconfig.json ./
COPY services/market-metadata-watcher/src ./src

# Prisma client is generated against the same schema as the CRM
# backend. We mount the schema at build time so the migration drift
# story stays "schema lives in backend/, services consume it via
# generated client" — no parallel schema files.
COPY backend/prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma

RUN npx tsc -p tsconfig.json

ENV NODE_ENV=production
# Headful mode + xvfb is wired (set WATCHER_HEADFUL=1 to enable) but
# disabled by default. The proxies + stealth plugin combination proved
# sufficient in production smoke tests; xvfb-run + chromium-headful
# adds startup complexity that broke `docker logs` capture in the
# initial rollout. Re-enable when needed by setting the env var on
# the host and switching CMD to:
#   ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24", "node", "dist/index.js"]
CMD ["node", "dist/index.js"]
