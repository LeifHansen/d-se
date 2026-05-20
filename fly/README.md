# DŌSE on Fly.io

Single-container deploy. Caddy front-routes to the api-server (port 4000) and the storefront's `serve.mjs` (port 8081), both running side-by-side in the same VM. External port: 8080 → fly's `[http_service]`.

## One-time setup

1. **Install flyctl** — `brew install flyctl` (then `flyctl auth login`).
2. **Reserve the app name:**
   ```sh
   flyctl apps create d-se   # or any name you like; update the app= line at the top of /fly.toml accordingly
   # (skip this step if your app already exists in fly.io)
   ```
3. **Provision Tigris (object storage)** — required for product/blog images and admin uploads:
   ```sh
   flyctl storage create --name d-se-storage
   # This auto-sets BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
   # AWS_ENDPOINT_URL_S3, and AWS_REGION as fly secrets on your app.
   ```
   Then set the app-level prefix paths within the bucket:
   ```sh
   flyctl secrets set \
     PUBLIC_OBJECT_SEARCH_PATHS="public,public/dose" \
     PRIVATE_OBJECT_DIR="private"
   ```

4. **Set secrets** (these don't appear in `fly.toml`, they're stored encrypted by fly):

   ```sh
   # Required
   flyctl secrets set \
     DATABASE_URL="postgres://..." \
     CLERK_PUBLISHABLE_KEY="pk_test_..." \
     CLERK_SECRET_KEY="sk_test_..." \
     SESSION_SECRET="$(openssl rand -hex 32)" \
     ORDER_TOKEN_SECRET="$(openssl rand -hex 32)" \
     ABANDONED_CART_SECRET="$(openssl rand -hex 32)" \
     QUARANTINE_DIGEST_SECRET="$(openssl rand -hex 32)"

   # Recommended for prod
   flyctl secrets set \
     STRIPE_SECRET_KEY="sk_live_..." \
     STRIPE_WEBHOOK_SECRET="whsec_..." \
     RESEND_API_KEY="re_..." \
     RESEND_FROM_EMAIL="orders@yourdomain.com" \
     EASYPOST_API_KEY="EZAK..." \
     EASYPOST_WEBHOOK_SECRET="..." \
     ADMIN_EMAILS="you@yourdomain.com,teammate@yourdomain.com" \
     SHIP_FROM_NAME="..." SHIP_FROM_STREET="..." SHIP_FROM_CITY="..." \
     SHIP_FROM_STATE="..." SHIP_FROM_ZIP="..." SHIP_FROM_COUNTRY="US" SHIP_FROM_PHONE="..."

   # Optional analytics / observability
   flyctl secrets set \
     GA4_API_SECRET="..." META_CAPI_TOKEN="..." \
     SENTRY_DSN="https://...@sentry.io/..." VITE_SENTRY_DSN="https://..." \
     TURNSTILE_SECRET_KEY="..."
   ```

   See [Required vs optional secrets](#required-vs-optional-secrets) below for the full reference.

5. **First deploy:**
   ```sh
   flyctl deploy
   # the working tree must NOT have the local pnpm-workspace.yaml override active
   # (skip-worktree); for Docker builds the canonical Replit-friendly config is used,
   # which still installs linux-x64 binaries correctly.
   ```

6. **Push the Drizzle schema** (one-time, plus any time the schema changes — the Dockerfile doesn't ship drizzle-kit):
   ```sh
   # Easiest: run schema push from your local Mac against the same Neon database
   set -a && . ./artifacts/api-server/.env.local && set +a
   pnpm --filter @workspace/db run push
   ```

7. **Seed the catalog** (optional, run once locally against the prod DB):
   ```sh
   node scripts-local-seed.mjs   # writes 3 sample products to the same DB
   # Note: image paths in this script point at the storefront's bundled brand assets
   # (Vite-served in dev). For production, you'll want to upload images to Tigris first
   # (via the admin UI at /admin) and update the product records to reference those URLs.
   ```

## Required vs optional secrets

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (Neon, Supabase, etc.) |
| `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | ✅ | Clerk's `pk_…` and `sk_…` |
| `SESSION_SECRET` | ✅ | Random 32+ bytes, used for cookie signing |
| `ORDER_TOKEN_SECRET` | ✅ | Random 32+ bytes for order-link signing |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | ⚠️ | Without these, checkout falls back to dev "instant paid" |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | ⚠️ | Without these, transactional emails silently no-op |
| `EASYPOST_API_KEY` + `EASYPOST_WEBHOOK_SECRET` | ⚠️ | Without these, shipping uses flat-rate fallback |
| `ADMIN_EMAILS` | ⚠️ | Comma-separated allowlist for `/admin/*` (if unset in dev, any signed-in user is admin; in prod set explicitly) |
| `SHIP_FROM_*` | ⚠️ | Required only if you use EasyPost label printing |
| `GA4_API_SECRET`, `META_CAPI_TOKEN` | ⏸ | Server-side conversion APIs (pair with the `VITE_*` IDs at build time) |
| `SENTRY_DSN` | ⏸ | API error reporting |
| `TURNSTILE_SECRET_KEY` | ⏸ | Only if you have Cloudflare Turnstile forms enabled |
| `BUCKET_NAME` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_ENDPOINT_URL_S3` | ⚠️ | Object storage. Auto-set by `flyctl storage create` (Tigris). Required for admin image uploads and product/blog images. |
| `PUBLIC_OBJECT_SEARCH_PATHS` + `PRIVATE_OBJECT_DIR` | ⚠️ | App-level prefixes within the bucket (e.g. `"public,public/dose"` and `"private"`). Required wherever storage is used. |

**Build-time (Vite) env** — these get baked into the storefront bundle. To change, redeploy:

| Var | Notes |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Same `pk_…` as the server, exposed to the browser |
| `VITE_GA4_ID` | e.g. `G-XXXXXXX` |
| `VITE_META_PIXEL_ID` | numeric pixel id |
| `VITE_SENTRY_DSN` | browser-side Sentry |
| `VITE_SITE_URL` | canonical URL used by prerender SEO (e.g. `https://d-se.fly.dev`) |

To pass these at build time: `flyctl deploy --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_…` or add them under `[build.args]` in `fly.toml`. They're **not secrets** (they ship in JS bundles).

## Day-2 operations

```sh
flyctl logs                          # live logs
flyctl status                        # machine state
flyctl ssh console                   # shell into the running VM
flyctl ssh console -C "ls /app/artifacts/api-server/dist"

flyctl scale count 2                 # scale to 2 machines
flyctl scale vm shared-cpu-2x        # bigger VM
flyctl scale memory 2048             # bump RAM

flyctl certs add yourdomain.com      # custom domain (run after pointing DNS to *.fly.dev)
```

## Architecture notes

- **Why Caddy?** The storefront's `serve.mjs` already implements per-route prerendered-HTML try_files (for SEO crawlers). Bypassing it would lose that. Caddy fronts both processes, routes `/api/*` (and SEO endpoints) to the api-server, everything else to serve.mjs. Same-origin, no CORS.
- **Why not a separate fly app per service?** The storefront fetches `/api/*` relative to its own origin (see `artifacts/storefront/src/lib/api.ts`). Splitting them would require CORS + an absolute `VITE_API_BASE_URL` baked at build time. Doable, but more moving parts.
- **Stripe webhooks** — point Stripe at `https://d-se.fly.dev/api/webhooks/stripe`. The api-server reads `STRIPE_WEBHOOK_SECRET` for signature verification.
- **Prerender at build time** — defaults to `PRERENDER_ALLOW_NO_DB=1` (skips product/blog SEO pages). For full SEO, pass `DATABASE_URL` as a build secret and set `PRERENDER_ALLOW_NO_DB=0` (see `fly.toml` comments).
