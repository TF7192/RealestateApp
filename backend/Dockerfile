# Backend image — built on the official Playwright Node image so
# Chromium + every system library it needs are pre-baked. This dodges
# the on-EC2 disk-pressure problem we hit when running
# `playwright install --with-deps chromium` at build time on a small
# (8GB) root volume — the in-progress install was ENOSPC'ing.
#
# The image carries Node 20 + Chromium ~147 + all GTK/ATK/NSS libs
# Reblaze's JS challenge needs to render correctly. PLAYWRIGHT_BROWSERS_PATH
# is already set in the base image (/ms-playwright).

FROM mcr.microsoft.com/playwright:v1.59.1-noble AS base
WORKDIR /app
# Base image already has openssl + ca-certificates; nothing extra needed.

FROM base AS deps
# Cache-bust arg — the deploy workflow passes a unique value (the
# commit SHA) so the npm-ci layer below is never reused from a prior
# build's GHA cache even when the lockfile is byte-identical.
ARG DEPS_CACHEBUST=unset
COPY package.json package-lock.json ./
# Two-phase install: `npm ci` for the reproducible lockfile pass, then
# a defensive `npm install` that re-checks the two voice-ingest deps
# in case npm 11 + peerDependencies resolution drops them on linux
# amd64 (seen twice in CI despite a clean sandbox install). The
# --no-save keeps the resulting node_modules consistent with the
# lockfile for everything else.
RUN echo "deps cachebust: $DEPS_CACHEBUST" \
  && npm ci --no-audit --no-fund \
  && npm install --no-audit --no-fund --no-save openai@6.34.0 @anthropic-ai/sdk@0.91.0 \
  && node -e "require.resolve('openai'); require.resolve('@anthropic-ai/sdk'); console.log('deps ok')"

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

FROM base AS runtime
ENV NODE_ENV=production
# Browser binaries already at /ms-playwright in the base image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Non-TS runtime assets (Hebrew TTFs for pdfkit). tsc does not copy
# anything outside the TS graph, so src/assets never lands in /dist
# without this explicit copy. When it's missing the agreement PDF
# silently falls back to Helvetica and renders Hebrew as blank glyphs.
COPY --from=build /app/src/assets ./dist/assets
# Same story for the Population-Authority streets registry — it's
# imported by addressNormalize.ts via resolveJsonModule, but tsc
# doesn't emit .json files, so it would be missing at runtime.
COPY --from=build /app/src/data ./dist/data
COPY package.json ./
# tsx runs the seed script in production without a separate build step
RUN npm install --no-save tsx@4.19.1 --cache /tmp/npm-cache --no-audit --no-fund
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && (npx tsx prisma/seed.ts || true) && node dist/server.js"]
