# syntax=docker/dockerfile:1
#
# Single-service image for Gaffer / Predikt.
#
# One container serves everything:
#   • the Fastify API (/api/*) and its SSE streams
#   • the built React SPA (same origin — no CORS, no second service)
#   • a bundled `anvil` demo chain + the escrow/USD₮ contracts (local mode)
#
# Data lives in an external Postgres (DATABASE_URL). The chain is ephemeral —
# it (and the demo USD₮ balances on it) resets on every restart. Accounts,
# points, pools, leagues and tournaments persist because they are Postgres rows.

# ---- foundry toolchain: anvil / forge / cast ----
FROM ghcr.io/foundry-rs/foundry:stable AS foundry

# ---- build: install deps, compile contracts + bundle the SPA ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# forge (compile) + anvil/cast come from the foundry image
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=foundry /usr/local/bin/cast  /usr/local/bin/cast

# install workspace deps first (layer-cached on the manifests)
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# app source
COPY . .

# compile the escrow contracts (forge fetches solc 0.8.24 on first run) and
# build the SPA into web/dist
RUN forge build --root contracts \
 && npm --workspace web run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    GAFFER_MODE=local \
    GAFFER_SERVE_WEB=1

# anvil (+ cast for the readiness probe) for the bundled local chain
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=foundry /usr/local/bin/cast  /usr/local/bin/cast

# the whole built app: node_modules (incl. tsx), server source (run via tsx),
# web/dist, and contracts/out
COPY --from=build /app /app

EXPOSE 8787
CMD ["sh", "docker/start.sh"]
