# Going live on a real chain (Arbitrum)

Predikt runs on one network at a time, chosen by a single env var (`GAFFER_NETWORK`).
`local` is the default (bundled anvil, the demo). This guide flips it to a **real,
persistent testnet** — Arbitrum Sepolia — where balances survive deploys and you can
recruit real testers. Mainnet is the same steps with different values (see the end).

| Network | `GAFFER_NETWORK` | Money | Faucet |
|---|---|---|---|
| Local demo (default) | `local` | MockUSDT (play) | auto |
| **Testnet** | `arbitrum-sepolia` | **test-USD₮ (play, persistent)** | **auto** |
| Mainnet | `arbitrum` | real USD₮0 | off (bring your own) |

Nothing here changes local mode — leave `GAFFER_NETWORK` unset and the demo behaves exactly as before.

---

## 1. Create an operator wallet

The **operator** deploys the token + pool contracts, runs the faucet, and settles results.
Make a fresh wallet (its private key is a secret — never commit it):

```bash
# with Foundry:
cast wallet new
# → prints an Address and a Private key. Save both.
```

## 2. Fund the operator with Arbitrum Sepolia ETH (for gas)

Grab free testnet ETH into the operator **address** from any of:
- https://www.alchemy.com/faucets/arbitrum-sepolia
- https://faucet.quicknode.com/arbitrum/sepolia
- or bridge Sepolia ETH at https://bridge.arbitrum.io

A little goes a long way on L2 — **0.05 ETH** funds hundreds of users.

## 3. Deploy the test-USD₮ (once)

From the repo root, with the operator key in your shell:

```bash
GAFFER_NETWORK=arbitrum-sepolia \
GAFFER_OPERATOR_KEY=0xYOUR_OPERATOR_PRIVATE_KEY \
npx tsx scripts/deploy-token.ts
```

It deploys the token, mints the operator a payout stash, and prints:

```
GAFFER_USDT_ADDRESS=0x…   ← copy this
```

## 4. Point the app at the testnet

Set these **environment variables** on the backend (Railway → your service → Variables):

```
GAFFER_NETWORK=arbitrum-sepolia
GAFFER_OPERATOR_KEY=0xYOUR_OPERATOR_PRIVATE_KEY
GAFFER_USDT_ADDRESS=0x…          # from step 3
# optional: GAFFER_RPC_URL=<a private Arbitrum Sepolia RPC>   (public default works too)
```

Redeploy. On boot the health check will report `network: Arbitrum Sepolia`, the top bar
shows a **TESTNET** badge, and every new wallet is auto-funded **100 test-USD₮ that
persists across deploys** — no more disappearing balances.

> The frontend on Vercel needs no change — it talks to the same backend URL. It just
> reflects whatever network the backend reports.

---

## Later: flipping to mainnet

Same shape, three differences:

```
GAFFER_NETWORK=arbitrum
GAFFER_USDT_ADDRESS=<the real USD₮0 token address on Arbitrum One>
GAFFER_OPERATOR_KEY=<a key funded with real ETH + real USD₮ for payouts>
```

- **No faucet** — the auto-mint is off on mainnet; users bring their own USD₮.
- **The operator key now controls real money** — use a hardware/secure key and least-privilege ops.
- **Real-money pools are regulated.** Get legal advice (licensing / KYC / geo / age gates) before launch. See the disclaimer in [README](README.md).
