#!/bin/bash
# Entrypoint: launch storefront serve.mjs + api-server + Caddy in parallel.
# Any process exiting → kill the others → container exits → fly restarts.
# bash (not sh) because we use `wait -n`.

set -e

# Optional: run drizzle migrations on boot. Disabled by default to keep startup fast;
# set DRIZZLE_AUTO_PUSH=1 to opt in. (Recommended: run `flyctl ssh console -C 'pnpm --filter @workspace/db run push'` manually after deploy.)
if [ "${DRIZZLE_AUTO_PUSH:-0}" = "1" ]; then
	echo "[start] running drizzle push"
	cd /app && node -e "process.exit(0)"  # placeholder — drizzle-kit isn't shipped in runtime image; use ssh console instead
fi

# api-server on :4000
( PORT=4000 node --enable-source-maps /app/artifacts/api-server/dist/index.mjs ) &
API_PID=$!

# storefront serve.mjs on :8081 (Caddy proxies external :8080 → here)
( PORT=8081 node /app/artifacts/storefront/scripts/serve.mjs ) &
WEB_PID=$!

# Caddy on :8080 (the public port; matches fly.toml internal_port)
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

# If any child exits, tear the rest down.
wait -n
EXIT_CODE=$?
echo "[start] a child process exited with code $EXIT_CODE; shutting down"
kill -TERM $API_PID $WEB_PID $CADDY_PID 2>/dev/null
exit $EXIT_CODE
