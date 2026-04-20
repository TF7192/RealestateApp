# Backend image — switched from node:20-alpine to bookworm-slim because
# Playwright's Chromium build is glibc-only (won't run on musl/alpine).
# `playwright install --with-deps chromium` pulls Chromium + every system
# library Reblaze's JS challenge needs to render correctly.
#
# Image size: ~700MB (was ~250MB on alpine). The Chromium bytes live in
# /ms-playwright (Playwright's default) and are copied into the runtime
# stage from `deps`. EC2 disk has plenty of headroom (8-16GB root).

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
# Pull Chromium + its system dependencies (libnss, libatk, libgtk, fonts,
# etc.). --with-deps invokes apt under the hood, so it requires the
# bookworm base; alpine would no-op silently.
RUN npx playwright install --with-deps chromium

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

FROM base AS runtime
ENV NODE_ENV=production
# Chromium binaries cached by Playwright at this path. Carrying the
# whole directory forward beats re-downloading on every cold start.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Same apt deps Chromium needs at runtime — Playwright's --with-deps
# already installed them in the `deps` stage but those layers got
# discarded when we switched to a clean `base` for the runtime stage.
# Reinstall the minimal set here so chromium can launch.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
      libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
      libasound2 libatspi2.0-0 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps    /ms-playwright /ms-playwright
COPY --from=build   /app/node_modules ./node_modules
COPY --from=build   /app/dist ./dist
COPY --from=build   /app/prisma ./prisma
COPY package.json ./
# tsx runs the seed script in production without a separate build step
RUN npm install --no-save tsx@4.19.1 --cache /tmp/npm-cache --no-audit --no-fund
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && (npx tsx prisma/seed.ts || true) && node dist/server.js"]
