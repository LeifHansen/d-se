# E-commerce Storefront

Single-store e-commerce site with multiple customer accounts, integrated payments, live shipping rates, blog, and SEO-optimized marketing pages.

## Architecture

Monorepo (pnpm workspaces) with:

- **`artifacts/storefront`** — React + Vite + Tailwind v4 + shadcn/ui SPA at `/`. Hosts the marketing site, product catalog, cart/checkout, customer account, blog, and admin dashboard. Uses `wouter` for routing and `@tanstack/react-query` via generated `@workspace/api-client-react` hooks.
- **`artifacts/api-server`** — Express 5 API at `/api/*`. Routes by domain in `src/routes/`. Uses Drizzle ORM, Clerk for auth, Stripe for payments, EasyPost for shipping, Resend for email, Replit Object Storage for product/blog images.
- **`lib/api-spec`** — single OpenAPI 3.1 source of truth (`openapi.yaml`). Run `pnpm --filter @workspace/api-spec run codegen` after every change.
- **`lib/api-zod`** — generated Zod request/response schemas (server validation).
- **`lib/api-client-react`** — generated React Query hooks (frontend).
- **`lib/db`** — Drizzle schema and Postgres pool. Schema in `src/schema/`, push with `pnpm --filter @workspace/db run push`.

## Integrations

- **Auth: Clerk** — Replit-managed. `CLERK_PROXY_PATH` mounted before body parsers in `app.ts`. Admin gated by `ADMIN_EMAILS` env var (comma-separated allowlist; if empty, any signed-in user is admin in dev).
- **Payments: Stripe** — Stripe Checkout sessions; webhook `/api/webhooks/stripe` mounted with raw body before `express.json()`. Falls back to dev "instant paid" if no key.
- **Shipping: EasyPost** — Live rates and label purchase. Falls back to flat-rate options if no key.
- **Email: Resend** — Order confirmation, shipping notifications, and newsletter welcome. Silently no-op if no key. Newsletter subscribers can also be mirrored to a Resend Audience by setting `RESEND_AUDIENCE_ID`.
- **Marketing analytics** — Consent-aware GA4 + Meta Pixel loader in `artifacts/storefront/src/lib/analytics.ts`. Browser-side: set `VITE_GA4_ID` (e.g. `G-XXXXXXX`) and/or `VITE_META_PIXEL_ID` to inject scripts after the user accepts the cookie banner; without IDs the tracker still pushes events to `window.dataLayer` but no provider script loads. Server-side conversion APIs (called from the Stripe webhook): `GA4_API_SECRET` (paired with `VITE_GA4_ID`) for the GA4 Measurement Protocol, and `META_CAPI_TOKEN` (paired with `VITE_META_PIXEL_ID`) for Meta Conversions API. All keys are optional — missing IDs silently no-op. Newsletter capture lives at `POST /api/newsletter/subscribe` and is invoked by the footer + scroll/exit-intent modal (`NewsletterForm`, `NewsletterModal`).
- **Object storage** — Public/private buckets via standard `/api/storage/*` routes.

## Domain model

- `products` — catalog items with images, inventory, weight, SEO fields, featured/published flags
- `carts` + `cart_items` — anonymous-or-user shopping carts (string nanoid IDs)
- `orders` + `order_items` — orders with shipping address (jsonb), Stripe + EasyPost identifiers, tracking
- `blog_posts` — markdown content with SEO fields, publish state

## Brand: DŌSE

Storefront is branded as **DŌSE** — a precision THC-infused beverage dropper (10 mg per drop, 30 doses per bottle).

- **Palette** (defined in `artifacts/storefront/src/index.css`):
  - Deep teal `#0F3933` (primary surface / ink)
  - Cream `#F1ECDC` (secondary surface / inverse ink)
  - Sage `#A8B89D` (secondary)
  - Seafoam `#B6C8C2` (accent in dark)
  - Gold `#C9A24C` (primary accent / CTAs)
- **Typography**: `Cormorant Garamond` for display/serif, `Inter` for body/UI. Loaded via Google Fonts in `index.html`.
- **Logo**: Mountain-inside-droplet emblem + `DŌSE` wordmark. SVG component at `artifacts/storefront/src/components/dose/Logo.tsx`.
- **Favicon**: `artifacts/storefront/public/favicon.svg` (gold emblem on teal).
- **Brand assets**: Sourced one-time from the user's Google Drive folder and committed to `artifacts/storefront/src/assets/brand/`. Re-pull on demand by re-running the Drive listing/download flow used in task 2.

## Storefront marketing landing

`artifacts/storefront/src/pages/home.tsx` composes the brand-applied landing from `src/components/dose/`:
`PromoBanner`, `Header` (with mobile drawer), `AgeGate` (21+ gate, persists in `localStorage` key `dose-age-confirmed`), `Hero`, `StorySection`, `ProductSection`, `RitualSection`, `TestimonialSection`, `JournalSection`, `NewsletterSection`, `Footer`, `MysteryOfferPill`, `CookieBanner` (`localStorage` key `dose-cookies-ack`).

## Observability & ops

- **Sentry** — Both apps initialize Sentry when a DSN is set. API: `SENTRY_DSN` (+ `SENTRY_RELEASE`). Storefront: `VITE_SENTRY_DSN` (+ `VITE_SENTRY_RELEASE`). Storefront mounts a `RootErrorBoundary` at the top of `main.tsx`. API has a global error handler and `unhandledRejection`/`uncaughtException` capture.
- **Request ID** — `requestIdMiddleware` runs first, generating a UUID (or honoring an inbound `X-Request-Id`), exposing it on responses, attaching it as `req.id` for `pino-http`, and binding it as a Sentry tag plus a breadcrumb. CORS exposes the header to the browser.
- **`/api/healthz`** — Returns structured `{ status, requestId, checks: { db, stripe, resend, webhook } }`. 200 when all OK, 503 when degraded. Webhook health = last verified Stripe event seen within 24h (tracked in `system_metrics`).
- **Stripe webhook freshness** — Every verified event upserts the timestamp into `system_metrics` (`stripe.webhook.last_received_at`). Surfaced via `/admin/stats` (`webhookLastReceivedAt`, `webhookHealthy`).
- **Low-stock daily digest** — `startLowStockDigestScheduler` ticks hourly, emails `ADMIN_EMAILS` once per 24h with all products at/under their per-product `lowStockThreshold` (Resend; no-op if Resend not configured).
- **Stripe webhook de-dup cleanup** — `startStripeEventCleanupScheduler` runs once a day (and ~60s after boot) and deletes `stripe_processed_events` rows older than `STRIPE_EVENT_RETENTION_DAYS` (default 30). Stripe only retries an event for ~3 days, so 30 days is a comfortable safety margin while keeping the table bounded. Disable with `DISABLE_STRIPE_EVENT_CLEANUP=1`.

## Admin extras

- `/admin/stats` adds `ordersToday`, `revenueCentsToday`, `webhookLastReceivedAt`, `webhookHealthy`. Low-stock count uses each product's own threshold.
- `/admin/orders` accepts `status`, `search` (matches order id or email), `from`, `to`.
- `POST /admin/products/inventory/bulk` updates `inventory` (and optional `lowStockThreshold`) for many products at once.
- `GET /admin/products/export.csv` streams a CSV of all products.
- `products.lowStockThreshold` (default 5) is exposed in `Product` / `ProductInput`.

## E2E tests

- Playwright config at repo root (`playwright.config.ts`); specs in `e2e/`.
- Smoke tests cover home rendering, 404 route, `/healthz` with `X-Request-Id`, products list, blog list.
- Run locally: `pnpm e2e:install` (once), then `E2E_BASE_URL=http://localhost:5000 pnpm e2e`.
- CI: `.github/workflows/e2e.yml` runs the suite on every PR and uploads the HTML report.

## Setup

The post-merge script (`scripts/post-merge.sh`) installs deps, pushes the DB schema, and seeds the launch catalog (3 DŌSE products + brand imagery) by running `pnpm --filter @workspace/api-server seed`. The seed is idempotent (slug-keyed upsert) and is skipped automatically when `DATABASE_URL` or `PUBLIC_OBJECT_SEARCH_PATHS` are unset. To run it manually: `pnpm --filter @workspace/api-server seed`.

## Status

Backend, schema, codegen, seed data, and integration scaffolding done. Observability (Sentry, request IDs, healthz, webhook freshness, daily low-stock digest) and admin API extensions (search, bulk inventory, CSV export, today metrics, per-product threshold) are in place. Playwright e2e harness is wired in CI. Stripe + Resend + EasyPost API keys still need to be wired. Storefront branding (logo, palette, typography, marketing landing) is applied; product/cart/checkout/blog/admin UI flows still need wiring to the API — admin UI extensions (search inputs, bulk inventory editor, CSV download button, today's-orders banner, webhook stale banner) are pending the customer/admin pages task that introduces the admin SPA.
