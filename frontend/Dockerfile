FROM node:20-alpine AS build
WORKDIR /app

# Build-time Vite env (baked into the bundle — no secret here, just the
# public PostHog project token). Both default to empty so local dev
# builds stay silent.
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_HOST="https://us.i.posthog.com"
ARG VITE_POSTHOG_ENABLED="true"
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY \
    VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST \
    VITE_POSTHOG_ENABLED=$VITE_POSTHOG_ENABLED

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
