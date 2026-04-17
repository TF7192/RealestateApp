FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

FROM base AS runtime
ENV NODE_ENV=production
# Copy node_modules FROM the build stage so the generated @prisma/client is included
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
# tsx runs the seed script in production without a separate build step
RUN npm install --no-save tsx@4.19.1 --cache /tmp/npm-cache --no-audit --no-fund
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && (npx tsx prisma/seed.ts || true) && node dist/server.js"]
