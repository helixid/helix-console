# HelixID Console — pre-built static SPA served by nginx.
#
# Standalone repo build (no cross-repo workspace dependency — the console
# no longer imports @helixid/sdk-js; its admin-API types are local, see
# src/api/types.ts):
#
#   docker build -f Dockerfile -t helixid-console .
#
# Run with runtime configuration (dev spec §6 — the same image works in any
# environment; nothing is baked in at build time):
#
#   docker run -p 8080:80 \
#     -e API_BASE_URL=http://localhost:4000 \
#     -e ADMIN_API_KEY=... \
#     helixid-console

FROM node:24.15.0-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh
COPY --from=build /repo/dist /usr/share/nginx/html
