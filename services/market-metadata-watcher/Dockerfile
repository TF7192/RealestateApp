# Match the existing yad2-crawler base image — Playwright + Chromium
# with all the system deps already installed. Per CLAUDE.md, the
# production deploy uses this exact image so the watcher and the CRM
# backend (which also runs Playwright via crawlAgency) share a stable
# Chromium version.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

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
CMD ["node", "dist/index.js"]
