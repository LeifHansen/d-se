# End-to-end tests (Playwright)

Run against a locally running stack (storefront + api) or any deployed URL.

## Local

```sh
# In one terminal: start the storefront + API
pnpm -r --filter "./artifacts/**" --parallel run dev

# In another:
pnpm dlx playwright install --with-deps chromium  # first time only
E2E_BASE_URL=http://localhost:5000 pnpm e2e
```

## CI

The workflow `.github/workflows/e2e.yml` runs these on every PR. Override the
target with `E2E_BASE_URL` and `E2E_API_BASE_URL` to run against staging.

## What's covered

- Storefront home renders core brand markup
- 404 route renders not-found UI
- `/api/healthz` returns structured dependency checks + `X-Request-Id` header
- `/api/products` and `/api/blog/posts` respond

Add coverage for: PDP render, add-to-cart, Stripe-test-mode checkout, signed-in
order history, blog post render, sitemap/robots, admin product creation as the
corresponding storefront pages are implemented.
