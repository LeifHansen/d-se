#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

if [ -n "$DATABASE_URL" ]; then
  # One-shot data migration: normalise existing order emails to lowercase +
  # trimmed so the lookup route can compare with simple equality. Idempotent —
  # rows already in canonical form are unaffected.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE orders SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));" \
    || echo "Order email normalisation skipped (psql failed)."
fi

if [ -n "$DATABASE_URL" ] && [ -n "$PUBLIC_OBJECT_SEARCH_PATHS" ]; then
  pnpm --filter @workspace/api-server seed
else
  echo "Skipping DŌSE catalog seed: DATABASE_URL and PUBLIC_OBJECT_SEARCH_PATHS must be set."
fi
