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
# Headful via xvfb. WATCHER_HEADFUL=1 toggles the playwright launch
# from headless to non-headless; xvfb-run gives the process a virtual
# display so Chromium starts cleanly. -a auto-picks a free display
# number; --server-args sets the screen geometry to a desktop-shaped
# viewport so window.screen reports a normal value.
ENV WATCHER_HEADFUL=1
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24", "node", "dist/index.js"]
