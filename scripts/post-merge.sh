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
