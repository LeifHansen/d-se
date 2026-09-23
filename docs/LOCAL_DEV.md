# Running DŌSE locally

The full shopping flow (browse → cart → checkout → order confirmation) runs
with only Postgres. Stripe, Clerk, Resend, EasyPost and S3 are all optional
locally.

## 1. Install

```sh
pnpm install
```

## 2. Database

Any Postgres 16 works. For example, with Docker:

```sh
docker run -d --name dose-pg -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
psql -h localhost -U postgres -c "create database dose_dev"
export DATABASE_URL=postgres://postgres@localhost:5432/dose_dev

pnpm --filter @workspace/db run push          # create tables
pnpm --filter @workspace/api-server run seed  # launch SKU (idempotent)
```

Existing databases created before the email-constraint fix also need
`psql "$DATABASE_URL" -f lib/db/manual-migrations/0001-fix-email-check-constraints.sql`.

## 3. API (port 4000)

```sh
cd artifacts/api-server
pnpm run build
NODE_ENV=development PORT=4000 PUBLIC_APP_URL=http://localhost:5173 \
  E2E_ADMIN_BYPASS_TOKEN=local-dev-admin \
  node --enable-source-maps dist/index.mjs
```

## 4. Storefront (port 5173)

```sh
cd artifacts/storefront
PORT=5173 BASE_PATH=/ E2E_API_PROXY=http://localhost:4000 VITE_COMING_SOON=0 \
  pnpm exec vite --config vite.config.ts
```

Open http://localhost:5173.

## What's live without keys

| Integration | Unset locally | To enable |
|---|---|---|
| Stripe | Checkout skips payment and marks the order paid (**dev only**, refused when `NODE_ENV=production`) | `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET` (`stripe listen --forward-to localhost:4000/api/webhooks/stripe`) |
| Clerk | Guest checkout works; account + admin sign-in unavailable (required in production) | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (API) and `VITE_CLERK_PUBLISHABLE_KEY` (storefront) |
| Resend | Emails are skipped | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| EasyPost | Flat-rate shipping | `EASYPOST_API_KEY` |

Admin API routes can be called locally with the header
`x-e2e-admin-bypass: local-dev-admin`. This bypass is ignored in production.
