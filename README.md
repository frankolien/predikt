<div align="start">

# 🏴 Predikt

**Self-custodial football games on USD₮.**

Predict live World Cup ties, run knockout cups, and play fantasy — all under one wallet whose keys never leave your device.

Built on **WDK** (Tether's self-custodial wallet SDK) for the **Tether Developers Cup**.

**Live → [prediktt.xyz](https://prediktt.xyz)**

</div>

---

## What it is

An all-in-one football economy. Four ways to play, one self-custodial USD₮ wallet under all of them:

- **Predict** — call the score on live ties, pool up with mates by invite code, split the pot at full time.
- **Organize** — run a knockout cup with a real entry fee; the pot auto-pays the winner.
- **Fantasy** — draft a salary-cap XI from real World Cup squads and climb mini-leagues for a prize pool.
- **Free or real** — play in points, or stake real on-chain USD₮ any time.

**Nobody holds the pot.** Buy-ins go into an on-chain escrow contract; payouts settle on-chain straight to your wallet with a real tx hash. The server never custodies funds — the contract does.

## Why WDK

Every wallet, USD₮ balance, `approve`, and escrow `deposit`/payout runs on [`@tetherto/wdk-wallet-evm`](https://github.com/tetherto). The 12-word recovery phrase is generated **on your device** and *is* your login — the same phrase recovers your whole account (points, pools, squads, cups) on any device, and the server never sees your private key.

> **Your keys, your money.** That's the entire product.

## Try it

- **Hosted:** **[prediktt.xyz](https://prediktt.xyz)** — the full product on a bundled demo chain. No install: grab a wallet, create a pool, join a cup, all live against real World Cup 2026 fixtures.
- **Local:** run it on your machine (below).

## Run it locally

**Prerequisites**
- **Node ≥ 20**
- **Foundry** (for the local `anvil` chain): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- A **Postgres** to point at (`DATABASE_URL`), or use the bundled default.

```bash
npm run setup     # install deps + compile contracts
npm run demo      # boots anvil + API + web, all local → http://localhost:5173
```

## Deploy

Two-service split (see [`DEPLOY.md`](DEPLOY.md) for the full walkthrough):

- **Backend** → Railway: the Fastify API + a bundled `anvil` demo chain, single container ([`Dockerfile`](Dockerfile)). Data lives in a **Railway Postgres**.
- **Frontend** → Vercel: the built SPA (root dir `web/`), pointed at the backend with `VITE_API_BASE`. Custom domain on `prediktt.xyz`.

The SPA calls the API cross-origin (fetch + SSE); the server allows it (`CORS`), so no proxy is needed.

## Live data

Fixtures, results, form, crests **and live in-play scores** are real — FIFA World Cup 2026, two providers behind one code path:

- **football-data.org** — set `FOOTBALL_DATA_API_KEY` for true in-play status + scores.
- **TheSportsDB** — keyless fallback, zero setup.

The server polls every **15s** and **pushes** each change to the browser over one SSE connection (`/api/stream`), so a goal lands in the UI in about a second. If the feed is unreachable at boot it falls back to a bundled dataset and keeps retrying.

## Modes

- **`local`** (default) — a local `anvil` chain + a `MockUSDT` we deploy, so a judge needs zero real funds and zero keys. Fully offline and deterministic.
- **`testnet`** — set `GAFFER_MODE=testnet`, `GAFFER_RPC_URL`, `GAFFER_OPERATOR_KEY`, `GAFFER_USDT_ADDRESS` to point WDK at a real testnet + real USD₮0. Same code paths.

## Architecture

```
web/  (Vite + React + Tailwind)  ──HTTP / SSE──▶  server/  (Fastify + Node)
  hosted on Vercel → prediktt.xyz                   ├─ wdk/      → @tetherto/wdk-wallet-evm  (self-custodial wallets)  ← WDK
                                                    ├─ chain/    → viem (operator/oracle + reads)
                                                    ├─ store/    → accounts, pools, fantasy, cups  (Drizzle + Postgres)
                                                    └─ football/ → live WC 2026 feed (SSE push)
  hosted on Railway + Railway Postgres
contracts/  (Foundry)  PredictionPool.sol (on-chain escrow) + MockUSDT.sol
```

## Repo structure

| Path | What |
| --- | --- |
| `server/src/wdk/` | Self-custodial wallets (`@tetherto/wdk-wallet-evm`) + escrow treasury |
| `server/src/chain/` | viem operator/oracle: deploy, fund, settle, reads |
| `server/src/store/` | Accounts, points, pools, fantasy, cups (Drizzle ORM → Postgres) |
| `server/src/football/` | Live WC 2026 feed + SSE push |
| `contracts/src/` | `PredictionPool.sol`, `MockUSDT.sol` |
| `web/src/` | React UI (Tailwind v4 design system, `motion` animations) |

## Notes

- Predikt is a **fan/entertainment sweepstake** demo, not a licensed gambling product.
- The default demo uses a local chain + `MockUSDT` so it's reproducible; the same code targets testnet.
- The repo also contains an optional **on-device AI pundit** (QVAC, `@qvac/sdk`) that runs locally via `npm run demo`. It runs natively on your machine, not in the cloud, so it isn't part of the hosted product.

## License

[MIT](LICENSE) — Predikt Contributors, 2026.
