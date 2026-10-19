# APEX Fitness - Frontend Production Dockerfile
# Multi-stage: build the React/Vite app, then serve with Nginx

FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts

# Maintain compatibility with ../../../api and ../../../backend imports
COPY backend/coach/core/ /app/backend/coach/core/
COPY backend/coach/core/ /app/api/coach/core/
COPY frontend/ ./

ARG APP_BUILD=""
RUN APP_BUILD="$APP_BUILD" npm run build

# -----------------------------------------------------------------------------
# Runtime Stage: High-performance unprivileged Nginx
FROM nginxinc/nginx-unprivileged:alpine

USER root
RUN apk upgrade --no-cache \
 && sed -i '/^[[:space:]]*user[[:space:]]/d' /etc/nginx/nginx.conf \
 && sed -i 's,\(/var\)\{0\,1\}/run/nginx.pid,/tmp/nginx.pid,' /etc/nginx/nginx.conf \
 && if ! grep -q 'client_body_temp_path' /etc/nginx/nginx.conf; then \
      sed -i "/^http {/a \    proxy_temp_path /tmp/proxy_temp;\n    client_body_temp_path /tmp/client_temp;\n    fastcgi_temp_path /tmp/fastcgi_temp;\n    uwsgi_temp_path /tmp/uwsgi_temp;\n    scgi_temp_path /tmp/scgi_temp;\n" /etc/nginx/nginx.conf; \
    fi \
 && chown -R nginx:root /var/cache/nginx /etc/nginx \
 && chmod -R g+w /var/cache/nginx /etc/nginx

USER 101
ARG VERSION=dev
ARG VCS_REF=dev
ARG BUILD_DATE=unknown

LABEL maintainer="Swapnil (APEX Fitness)" \
    org.opencontainers.image.title="apex-frontend" \
    org.opencontainers.image.description="Frontend web application for APEX Fitness" \
    org.opencontainers.image.source="https://github.com/swapnil-exxe/apex-fitness" \
    org.opencontainers.image.licenses="AGPL-3.0-or-later" \
    org.opencontainers.image.version=$VERSION \
    org.opencontainers.image.revision=$VCS_REF \
    org.opencontainers.image.created=$BUILD_DATE

COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 web/05-check-base-path.sh /docker-entrypoint.d/
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY catalogue/media/ /usr/share/nginx/html/exercise-media/

ENV NGINX_PORT=80
ENV BACKEND=api
ENV PORT=3000
ENV RESOLVER=127.0.0.11
ENV CF_CONNECTING_IP=""
ENV BASE_PATH=""
ENV MEDIA_UPLOAD_MAX=48m

HEALTHCHECK --interval=5m \
            --timeout=5s \
            --retries=3 \
            CMD wget --spider -q "http://127.0.0.1:${NGINX_PORT}/" || exit 1
