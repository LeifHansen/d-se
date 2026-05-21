# DŌSE — Fly.io single-container deploy.
#
# Architecture inside the container:
#   Caddy (port 8080, public)
#     ├── /api/*, /healthz, /sitemap.xml, /robots.txt  → reverse_proxy localhost:4000  (api-server)
#     └── /*                                            → reverse_proxy localhost:8081  (storefront serve.mjs, prerendered try_files)
#
# Build args:
#   PRERENDER_ALLOW_NO_DB   "1" to skip product/blog prerender when DATABASE_URL isn't
#                           available at build time (default). Set to "0" and pass
#                           DATABASE_URL as a build secret for full SEO prerender.

# ---------- Stage 1: deps ----------
FROM node:24-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/storefront/package.json ./artifacts/storefront/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/
# Strip the local preinstall guard so Docker (which sets its own user agent) doesn't trip it.
RUN node -e "const p=require('./package.json');delete p.scripts.preinstall;require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2))"
RUN pnpm install --frozen-lockfile --prod=false

# ---------- Stage 2: build ----------
FROM deps AS build
ARG PRERENDER_ALLOW_NO_DB=1
ENV PRERENDER_ALLOW_NO_DB=${PRERENDER_ALLOW_NO_DB}
ENV PORT=4000 BASE_PATH=/

# VITE_* build args — these get baked into the storefront JS bundle at build
# time. They are NOT secrets (the publishable Clerk key, GA4 ID, etc. are
# meant to ship in client code). Pass via fly.toml [build.args] or
# `flyctl deploy --build-arg VITE_FOO=bar`. Empty defaults are fine —
# the storefront code has graceful no-op fallbacks for missing values.
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ARG VITE_API_BASE_URL=""
ARG VITE_SITE_URL=""
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_RELEASE=""
ARG VITE_GA4_ID=""
ARG VITE_META_PIXEL_ID=""
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE}
ENV VITE_GA4_ID=${VITE_GA4_ID}
ENV VITE_META_PIXEL_ID=${VITE_META_PIXEL_ID}
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}

COPY . .
# Mirror the deps stage preinstall mutation so re-running install in build (if any) works.
RUN node -e "const p=require('./package.json');delete p.scripts.preinstall;require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2))"
RUN pnpm run typecheck
RUN pnpm -r --filter "./artifacts/api-server" --filter "./artifacts/storefront" run build

# ---------- Stage 3: runtime ----------
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules (production: api-server only needs its own; storefront serve.mjs is pure node, no deps)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=build /app/lib ./lib
COPY --from=build /app/package.json ./

# Copy built api-server output
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy built storefront output + the serve script
COPY --from=build /app/artifacts/storefront/dist ./artifacts/storefront/dist
COPY --from=build /app/artifacts/storefront/scripts ./artifacts/storefront/scripts

# Caddy config + entrypoint
COPY fly/Caddyfile /etc/caddy/Caddyfile
COPY fly/start.sh /start.sh
RUN chmod +x /start.sh

ENV NODE_ENV=production
EXPOSE 8080
CMD ["/start.sh"]
