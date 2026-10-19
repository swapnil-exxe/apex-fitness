# APEX Fitness - Backend Production Dockerfile
# Builds the production Node.js API server

FROM node:22-alpine AS base

ARG VERSION=dev
ARG VCS_REF=dev
ARG BUILD_DATE=unknown

LABEL maintainer="Swapnil (APEX Fitness)" \
    org.opencontainers.image.title="apex-backend" \
    org.opencontainers.image.description="Backend API service for APEX Fitness" \
    org.opencontainers.image.source="https://github.com/swapnil-exxe/apex-fitness" \
    org.opencontainers.image.licenses="AGPL-3.0-or-later" \
    org.opencontainers.image.version=$VERSION \
    org.opencontainers.image.revision=$VCS_REF \
    org.opencontainers.image.created=$BUILD_DATE

WORKDIR /app

RUN apk upgrade --no-cache && adduser -D -H -s /sbin/nologin coach

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

COPY backend/server.js \
     backend/db.js \
     backend/auth-google.js \
     backend/push-messages.js \
     backend/nudge.js \
     backend/nudge-copy.js \
     backend/verify-error.js \
     backend/password.js \
     backend/rate-limit.js \
     backend/passkeys-store.js \
     backend/device-link.js \
     backend/media.js \
     backend/queue.js \
     backend/sync-stamps.js \
     backend/durable.js ./

COPY backend/coach ./coach

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=5m \
            --timeout=5s \
            --retries=3 \
            CMD wget --spider -q "http://127.0.0.1:${PORT}/api/health" || exit 1

# Strip npm from production image for security hardening
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

CMD ["node", "server.js"]
