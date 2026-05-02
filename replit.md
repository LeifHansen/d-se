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
- **Email: Resend** — Order confirmation and shipping notifications. Silently no-op if no key.
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

## Status

Backend, schema, codegen, seed data, and integration scaffolding done. Stripe + Resend + EasyPost API keys still need to be wired. Storefront branding (logo, palette, typography, marketing landing) is applied; product/cart/checkout/blog/admin UI flows still need wiring to the API.
