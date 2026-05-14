#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

if [ -n "$DATABASE_URL" ] && [ -n "$PUBLIC_OBJECT_SEARCH_PATHS" ]; then
  pnpm --filter @workspace/api-server seed
else
  echo "Skipping DŌSE catalog seed: DATABASE_URL and PUBLIC_OBJECT_SEARCH_PATHS must be set."
fi
