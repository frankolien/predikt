# 🏴 Gaffer — *your keys, your model, your call*

**Self-custodial football prediction pools with a private, on-device AI pundit.**
Built for the **Tether Developers Cup** on the **QVAC** (local AI) + **WDK** (self-custodial wallets) tracks.

---

## The one-line thesis

> **Self-custodial money + self-custodial intelligence.**
> Around a big tournament, mates run a prediction sweepstake — but nobody holds the pot and
> nobody harvests your bets. Your USDt stays in your own wallet; your betting brain stays on your
> own device.

This is the connective tissue that makes QVAC + WDK feel like **one product**, not two SDKs bolted
together. You hold your keys (WDK) **and** you hold your model (QVAC).

## Why it's a winner (mapped to the judging rubric)

| Criterion | How Gaffer scores |
| --- | --- |
| **Technical ambition** | On-device LLM inference + multi-account self-custodial EVM wallets + an on-chain escrow pool with rule-based payout, all running offline on one laptop. |
| **User experience** | One clean flow: make a wallet → join a match pool → *ask the Gaffer* → stake → settle → get paid. A punchy AI pundit persona makes it fun. |
| **Real-world use** | Tournament sweepstakes among friends are a massive, real behaviour. Gaffer removes the treasurer (self-custodial escrow) and the creepy cloud "AI tipster" (on-device analysis). |
| **Creativity / surprise** | Every "AI betting tip" product on earth is a cloud service that *harvests your data*. Gaffer is the exact inverse: the AI runs on your device and never phones home. That inversion is the surprise. |
| **Real use of the tracks** | **Both tracks are load-bearing.** Remove QVAC → no private analysis. Remove WDK → no self-custodial stakes/payouts. Neither is a logo skin. |

## The core demo loop

1. **Own your keys.** WDK generates a seed phrase locally and derives your EVM account. We never see
   your private key — it never leaves the machine.
2. **Join a pool.** Pick an upcoming tournament fixture and a stake in USDt.
3. **Ask the Gaffer.** An LLM running **entirely on-device via QVAC** streams you a private read:
   form analysis, a predicted scoreline, and a spicy hot-take. Visibly offline — pull the network
   cable and it still works.
4. **Lock your pick + stake.** WDK moves your USDt into an on-chain escrow **PredictionPool**
   contract. No human holds the funds; the contract does.
5. **Settle.** When the result is in, the pool pays out USDt **by rule** to the winners'
   self-custodial wallets. The Gaffer delivers the post-match verdict.

## Architecture (all local, all self-custodial)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Judge's laptop — nothing leaves it                                         │
│                                                                             │
│   web/  (Vite + React)  ──HTTP──▶  server/  (Node + tsx, localhost only)    │
│   football-themed UI                 │                                       │
│                                      ├─ qvac/  →  @qvac/sdk                  │
│                                      │           on-device LLM (Llama 3.2)   │  ← QVAC track
│                                      │           loadModel / completion      │
│                                      │                                       │
│                                      ├─ wdk/   →  @tetherto/wdk-wallet-evm   │  ← WDK track
│                                      │           self-custodial accounts,    │
│                                      │           USDt balance + transfer     │
│                                      │                                       │
│                                      └─ pool/  →  settlement logic           │
│                                                    │                          │
│                                        contracts/  ▼                          │
│                                        anvil (local EVM) + PredictionPool     │
│                                        + MockUSDT (demo)                      │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Demo runs fully offline** on a local `anvil` chain with a mock USDT so a judge needs zero real
  funds and zero API keys — which is exactly the ethos of both tracks (no cloud AI, self-custody).
- **Testnet mode** (config flag) points WDK at a real testnet + real USD₮0 for authenticity.

## Non-goals / honesty notes

- This is a **fan/entertainment sweepstake** demo, not a licensed gambling product.
- The demo uses a local chain + mock USDT so it's reproducible; the same code paths target testnet.
- We only claim what we build during the event; any reused prior art is listed in the README.
