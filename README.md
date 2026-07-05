<div align="center">

# 🏴 Gaffer

### *your keys, your model, your call*

**Self-custodial football prediction pools with a private, on-device AI pundit.**

Built for the **Tether Developers Cup** on the **QVAC** (local AI) + **WDK** (self-custodial wallets) tracks.

`self-custodial money` · `self-custodial intelligence`

</div>

---

## The idea in one line

> Around a big tournament, mates run a prediction sweepstake — but with Gaffer **nobody holds the
> pot** and **nobody sees your bets**. The stakes are self-custodial USDt held by an on-chain escrow
> contract. The pundit is an LLM that runs **entirely on your device**.

That single thesis — *self-custodial money **and** self-custodial intelligence* — is what makes
QVAC + WDK feel like **one product** instead of two SDKs bolted together. You hold your keys (WDK)
**and** you hold your model (QVAC).

Every "AI betting tip" product on earth is a cloud service that harvests your data. Gaffer is the
exact inverse: the AI runs on your device and never phones home. That inversion is the point.

## What it does — the demo loop

1. **Own your keys.** A self-custodial wallet is generated locally with **WDK**. The seed never
   leaves the machine; the server never sees your private key.
2. **Ask the Gaffer.** An LLM running **entirely on-device via QVAC** streams you a private read of
   the tie — form analysis, a called scoreline, a confidence, and a spicy hot-take. Pull the network
   cable; it still works.
3. **Call it & stake.** You sign an `approve` + `deposit` and your USDt goes into an on-chain
   **PredictionPool** escrow. No human custodies the funds — the contract does.
4. **Get paid by rule.** At full time a result oracle posts the score, and the contract pays every
   correct-outcome caller their pro-rata share of the pot — automatically, to their self-custodial
   wallet.

The whole thing runs **offline on one laptop**: local AI (QVAC) + a local chain + self-custodial
wallets (WDK). No cloud, no API keys, no real funds.

## Why both tracks are load-bearing

| | How it's used | Remove it and… |
| --- | --- | --- |
| **QVAC** (local AI) | The Gaffer's analysis/scoreline/hot-take is real on-device LLM inference (`@qvac/sdk`, Llama 3.2 1B on Apple-Silicon Metal), streamed token-by-token. See [`server/src/qvac`](server/src/qvac). | …there's no private pundit. The core UX is gone. |
| **WDK** (self-custody) | Each fan's wallet, USDt balance, `approve`, and the escrow `deposit` are driven by `@tetherto/wdk-wallet-evm` — including arbitrary contract calls via `sendTransaction({to,value,data})`. See [`server/src/wdk`](server/src/wdk). | …no self-custodial stakes or payouts. The money layer is gone. |

Neither is a logo skin. This is the judging criterion "real use of your track" taken literally.

## Quick start

**Prerequisites**
- **Node ≥ 22.17** (QVAC needs it; check with `node -v`)
- **Foundry** (for the local `anvil` chain): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- macOS 14+ on Apple Silicon is the smoothest path for on-device inference (Metal). Linux/Windows
  work too (Vulkan). ≥ 5 GB free disk for the model, ≥ 4 GB RAM.

**Run it**
```bash
npm run setup     # install deps + compile contracts
npm run demo      # boots anvil + API + web, all local
```
Then open **http://localhost:5173**.

> First run downloads the on-device model (~773 MB, cached in `~/.qvac/models`). The UI shows a live
> loading state while it warms up — the rest of the app is usable immediately.

**Or run the pieces yourself**
```bash
npm run chain     # terminal 1 — local anvil chain
npm run server    # terminal 2 — API (deploys contracts, loads model, seeds a pool)
npm run web       # terminal 3 — Vite UI on :5173
```

## Beyond the core loop

- **Live in-play tracker** — once a match kicks off (real feed, pushed over SSE in ~1s, or the demo "simulate live" control), the room becomes a live tracker: live score + a ticking minute, a "who's winning now" board across everyone in the pool, and the **Gaffer reacting on-device** as the score changes. At full time the real score auto-fills the settle oracle.
- **On-device voice pundit** — the Gaffer can **speak** its read aloud (QVAC Supertonic TTS) and you can **ask by voice** (record → on-device Whisper STT → streamed answer, which you can also hear). All local; speech models lazy-load on first use.
- **Telegram bot** — a companion bot over the same API (see below).
- **Light / dark** — a monochrome theme toggle in the nav, persisted.
- **Two pages** — a landing page and a dedicated `/room/:fixtureId` match room.

## Live data — real-time

Match fixtures, results, team form, crests **and live in-play scores** are **real and live** — FIFA
World Cup 2026. Two providers, same code path:

- **football-data.org** (set `FOOTBALL_DATA_API_KEY` in `.env`) — true in-play `IN_PLAY` status +
  live scores. Its free tier omits the live *minute*, so we derive a ticking clock from kickoff.
- **TheSportsDB** (keyless fallback, zero setup) — real fixtures/results/form; best-effort live state.

The server polls the feed every **15s** and **pushes** every score/status/minute change to the
browser over a single SSE connection (`/api/stream`) the instant it's detected — so a goal lands in
the UI in about a second, not on a poll tick. The marquee pool auto-resolves to the soonest open tie;
if the feed is unreachable at boot, it falls back to a bundled offline dataset and keeps retrying.

Only the *match data* comes from a feed — the **AI (QVAC) and wallets (WDK) stay fully local**.

## Telegram bot

A [grammy](https://grammy.dev) companion bot (a thin client over the localhost API) lives in
[`server/src/telegram/`](server/src/telegram/). Browse fixtures, get the on-device Gaffer's read,
create a self-custodial wallet, join pools, and get DM'd when a pool settles — all from Telegram.

```bash
cd server
TELEGRAM_BOT_TOKEN=<token-from-@BotFather> npm run bot   # GAFFER_API defaults to http://127.0.0.1:8787
```

Commands: `/start` `/fixtures` `/gaffer <id>` `/wallet` `/join <id> <h>-<a>` `/pool <id>` `/me`.
Note: it stores wallet seeds in memory for the demo only — a production bot must never hold seeds.

## Modes

- **`local`** (default) — a local `anvil` chain + a `MockUSDT` we deploy, so a judge needs zero real
  funds and zero keys. Fully offline and deterministic. This *is* the ethos of both tracks.
- **`testnet`** — set `GAFFER_MODE=testnet`, `GAFFER_RPC_URL`, `GAFFER_OPERATOR_KEY`,
  `GAFFER_USDT_ADDRESS` to point WDK at a real testnet + real USDT/USD₮0. Same code paths.

## Architecture

```
web/  (Vite + React + Tailwind v4 + motion)   ── HTTP / SSE ──▶  server/  (Node + tsx, localhost)
  floodlit "matchday broadsheet" UI                                 ├─ qvac/  → @qvac/sdk   (on-device LLM)     ← QVAC
                                                                     ├─ wdk/   → @tetherto/wdk-wallet-evm         ← WDK
                                                                     ├─ chain/ → viem (operator/oracle, reads)
                                                                     └─ pool/  → settlement + manager
contracts/  (Foundry)  PredictionPool.sol (on-chain-settlement escrow) + MockUSDT.sol
```

See [`docs/CONCEPT.md`](docs/CONCEPT.md) for the full concept and [`docs/SDK-NOTES.md`](docs/SDK-NOTES.md)
for the verified QVAC/WDK API notes this is built on.

## Repo structure

| Path | What |
| --- | --- |
| `server/src/qvac/` | On-device pundit — engine (`@qvac/sdk`), prompt/parse, SSE service |
| `server/src/wdk/` | Self-custodial fan wallets (`@tetherto/wdk-wallet-evm`) |
| `server/src/chain/` | viem operator/oracle: deploy, fund, settle, reads |
| `server/src/pool/` | Deterministic settlement + the stateful pool manager |
| `contracts/src/` | `PredictionPool.sol`, `MockUSDT.sol` |
| `web/src/` | React UI (Tailwind v4 design system, `motion` animations) |
| `scripts/demo.mjs` | One-command local demo orchestrator |

## Honesty notes

- Gaffer is a **fan/entertainment sweepstake** demo, not a licensed gambling product.
- The default demo uses a local chain + mock USDT so it's reproducible; the same code targets testnet.
- If the QVAC model can't load in a given environment, the pundit falls back to a clearly-labelled
  scripted mode (`GAFFER_MOCK_AI=1`) so a live demo never hard-crashes — real on-device inference is
  the default and headline path.
- We only claim what we built during the event. Third-party components: `@qvac/sdk`,
  `@tetherto/wdk-wallet-evm`, `viem`, `fastify`, `react`, `tailwindcss`, `motion`, `foundry`.

## License

[MIT](LICENSE) — Gaffer Contributors, 2026.
