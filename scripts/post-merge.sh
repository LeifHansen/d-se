#!/bin/bash
set -e
pnpm install --frozen-lockfile

if [ -n "$DATABASE_URL" ]; then
  # One-shot cleanup: null out any pre-existing empty/whitespace-only email
  # rows on orders/carts so the email-canonical CHECK constraint added by the
  # subsequent `pnpm --filter db push` doesn't fail on rollout. Abandoned
  # carts have a NOT NULL email — drop any junk rows there. Idempotent.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE orders SET email = NULL WHERE email IS NOT NULL AND length(btrim(email)) = 0;" \
    || echo "Order empty-email cleanup skipped (psql failed)."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE carts SET email = NULL WHERE email IS NOT NULL AND length(btrim(email)) = 0;" \
    || echo "Cart empty-email cleanup skipped (psql failed)."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "DELETE FROM abandoned_carts WHERE length(btrim(email)) = 0;" \
    || echo "Abandoned-cart empty-email cleanup skipped (psql failed)."

  # One-shot cleanup: null out (or delete) any pre-existing email rows that
  # don't look roughly like an address (must contain '@' with at least one
  # non-whitespace, non-'@' character on each side) so the shape CHECK
  # constraint added by the subsequent `pnpm --filter db push` doesn't fail
  # on rollout. Idempotent.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE orders SET email = NULL WHERE email IS NOT NULL AND email !~ '^[^@[:space:]]+@[^@[:space:]]+\$';" \
    || echo "Order malformed-email cleanup skipped (psql failed)."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE carts SET email = NULL WHERE email IS NOT NULL AND email !~ '^[^@[:space:]]+@[^@[:space:]]+\$';" \
    || echo "Cart malformed-email cleanup skipped (psql failed)."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "DELETE FROM abandoned_carts WHERE email !~ '^[^@[:space:]]+@[^@[:space:]]+\$';" \
    || echo "Abandoned-cart malformed-email cleanup skipped (psql failed)."
fi

if [ -n "$DATABASE_URL" ]; then
  # One-shot migration: drop the legacy per-order lookup-token columns.
  # The route used to compare an emailed token against `orders.lookup_token`,
  # but verification is now purely HMAC (see lib/orderToken.ts) and the
  # admin "rotate link" UI is gone. Use IF EXISTS so this is idempotent and
  # safe on databases where drizzle-kit has already dropped the columns.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "ALTER TABLE orders
       DROP COLUMN IF EXISTS lookup_token,
       DROP COLUMN IF EXISTS lookup_token_issued_at,
       DROP COLUMN IF EXISTS lookup_token_last_used_at,
       DROP COLUMN IF EXISTS lookup_token_last_channel;" \
    || echo "Legacy lookup-token column drop skipped (psql failed)."
fi

pnpm --filter db push

if [ -n "$DATABASE_URL" ]; then
  # One-shot data migration: normalise existing order emails to lowercase +
  # trimmed so the lookup route can compare with simple equality. Idempotent —
  # rows already in canonical form are unaffected.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE orders SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));" \
    || echo "Order email normalisation skipped (psql failed)."

  # Mirror the same normalisation onto carts and abandoned_carts so cart and
  # order email columns share one canonical form (lower + trim). Idempotent —
  # rows already in canonical form are unaffected.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE carts SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));" \
    || echo "Cart email normalisation skipped (psql failed)."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE abandoned_carts SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));" \
    || echo "Abandoned-cart email normalisation skipped (psql failed)."
fi

if [ -n "$DATABASE_URL" ] && [ -n "$PUBLIC_OBJECT_SEARCH_PATHS" ]; then
  pnpm --filter @workspace/api-server seed
else
  echo "Skipping DŌSE catalog seed: DATABASE_URL and PUBLIC_OBJECT_SEARCH_PATHS must be set."
fi
