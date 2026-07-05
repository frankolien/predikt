# Deploying Predikt to Railway

Predikt ships as **one container**. A single Fastify process serves the JSON/SSE
API *and* the built React SPA from the same origin, and — in the default local
mode — bundles an `anvil` demo chain so real on-chain USD₮ buy-ins and payouts
work out of the box. The only external dependency is **Postgres**.

```
┌──────────────────────── Railway ────────────────────────┐
│  Service: predikt (Dockerfile)                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Fastify @ $PORT (0.0.0.0)                           │ │
│  │   /api/*  → accounts, pools, fantasy, organize, AI  │ │
│  │   /*      → web/dist (SPA, client-side routing)     │ │
│  │ anvil @ :8545  → MockUSDT + escrow (bundled)        │ │
│  └────────────────────────────────────────────────────┘ │
│                          │ DATABASE_URL                  │
│  Plugin: Postgres  ◀─────┘                               │
└──────────────────────────────────────────────────────────┘
```

Accounts, points, pools, leagues and tournaments are **Postgres rows** → they
persist across restarts and redeploys. The chain is ephemeral (see
[Caveats](#caveats)).

---

## 1. Prerequisites

- A [Railway](https://railway.app) account.
- This repo pushed to GitHub (Railway deploys from a repo).
- Nothing else — no API keys are required for the core demo. The live football
  feed and the on-device AI both degrade gracefully without their optional keys.

## 2. Create the project

1. **New Project → Deploy from GitHub repo** → pick this repo.
   Railway detects [`railway.json`](railway.json) and builds the
   [`Dockerfile`](Dockerfile) (no Nixpacks guessing).
2. **New → Database → Add PostgreSQL.** This provisions a Postgres instance and
   exposes a `DATABASE_URL` variable to the project.
3. On the **predikt** service, add a reference to the database URL so the app
   picks it up:
   - Service → **Variables** → **New Variable** → **Add Reference** →
     `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}`.

The schema is applied automatically on boot — `initDb()` runs the Drizzle
migrations in [`server/drizzle/`](server/drizzle/) against `DATABASE_URL`. No
manual migration step.

## 3. Set environment variables

On the **predikt** service → **Variables**:

| Variable | Value | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` | ✅ | Reference to the Postgres plugin. |
| `GAFFER_MODE` | `local` | — | Default. Bundled anvil + demo USD₮. Set `testnet` for real USD₮0. |
| `DATABASE_SSL` | `require` | — | Only if you use the *public* Postgres URL. The private-network URL (`*.railway.internal`) does **not** need it. |
| `FOOTBALL_DATA_API_KEY` | *(your key)* | — | Optional. Real in-play WC2026 scores. Without it, a keyless fallback is used. |

`PORT` and `HOST` are handled for you — Railway injects `PORT`, and the image
defaults `HOST=0.0.0.0` and `GAFFER_SERVE_WEB=1`.

> Prefer the **private** database URL (`postgres.railway.internal`) — it stays on
> Railway's internal network, is faster, and needs no SSL. Use the public
> `DATABASE_PUBLIC_URL` + `DATABASE_SSL=require` only for connecting from outside
> Railway (e.g. running a smoke test from your laptop).

## 4. Deploy

Railway builds and deploys on push. First build takes a few minutes (it compiles
the Solidity contracts and bundles the SPA). When it's live:

- **Settings → Networking → Generate Domain** to get a public URL.
- Open it — the SPA loads, and `GET /api/health` returns `{ "ok": true, … }`.

The health check at `/api/health` returns `200` as soon as the server is
listening; the chain and the on-device model warm up in the background, so the
app is reachable immediately (with `chainReady` flipping to `true` shortly after).

---

## Caveats

- **The chain is ephemeral.** The bundled `anvil` (and the demo USD₮ balances,
  escrow deposits, and settlement tx hashes on it) reset on every restart /
  redeploy. This is intentional for a demo — the money layer is real *on-chain*
  behaviour against a real EVM, just not a persistent one. **All app data
  (accounts, points, pools, fantasy squads, tournaments) survives** because it
  lives in Postgres, keyed to each user's self-custodial wallet address.
- **Wallet = identity.** A user's 12-word WDK recovery phrase derives their
  address and *is* their login. It is never persisted server-side; the same
  phrase recovers the same account (and all its history) on any device.
- **On-device AI (QVAC).** The Gaffer model downloads weights on first use and
  runs in-process. On a small Railway instance this may be slow or skipped; the
  app catches the error and runs fine without it (AI features simply stay quiet).
  Give the service more memory if you want the pundit live.

---

## Run the production image locally

To verify the exact container before pushing:

```bash
# 1. a Postgres to point at (or use your own)
docker run -d --name predikt-pg -p 5434:5432 \
  -e POSTGRES_USER=gaffer -e POSTGRES_PASSWORD=gaffer -e POSTGRES_DB=gaffer \
  postgres:16-alpine

# 2. build + run the app image (host networking lets it reach the pg above)
docker build -t predikt .
docker run --rm -p 8787:8787 \
  -e DATABASE_URL='postgres://gaffer:gaffer@host.docker.internal:5434/gaffer' \
  predikt

# 3. open http://localhost:8787  →  SPA + /api on one origin
```

---

## Testnet mode (real USD₮0, optional)

To run against a real testnet instead of the bundled anvil, set on the service:

```
GAFFER_MODE=testnet
GAFFER_RPC_URL=<your testnet RPC>
GAFFER_OPERATOR_KEY=<funded operator/oracle private key>
GAFFER_USDT_ADDRESS=<USD₮0 token address on that chain>
```

In this mode no chain is bundled — the container talks to the RPC you point it
at, and the operator key deploys the per-fixture escrow pools and posts results.
