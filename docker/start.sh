#!/usr/bin/env sh
# Container entrypoint. In local mode it boots the bundled anvil chain, waits for
# it to answer, then hands off to the API server (which serves /api + the SPA).
# In testnet mode it skips anvil and points at GAFFER_RPC_URL.
set -e

MODE="${GAFFER_MODE:-local}"
RPC="${GAFFER_RPC_URL:-http://127.0.0.1:8545}"

if [ "$MODE" = "local" ]; then
  echo "[start] launching bundled anvil (local demo chain)…"
  anvil --silent &

  # The server deploys the demo USD₮ + escrow contracts on boot, so wait until the
  # RPC actually answers before starting it — otherwise that first deploy fails.
  echo "[start] waiting for anvil RPC at $RPC …"
  i=0
  until cast block-number --rpc-url "$RPC" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      echo "[start] WARNING: anvil not ready after 30s — starting server anyway" >&2
      break
    fi
    sleep 0.5
  done
  [ "$i" -le 60 ] && echo "[start] anvil ready ✅"
fi

# Serves the JSON/SSE API and the built SPA on $PORT (Railway injects it).
exec npm --workspace server run start
