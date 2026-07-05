# SDK integration notes (verified)

These are the exact QVAC + WDK APIs Gaffer builds on, verified against the published npm tarballs
(READMEs + shipped `.d.ts`) on 2026-07-04. Kept here so the integration is auditable.

## QVAC — `@qvac/sdk` (on-device AI)

- **Version:** 0.14.1 · **Node:** ≥ 22.17 · runs on macOS 14+ Apple-Silicon (Metal), Linux/Windows (Vulkan).
- **Model:** `LLAMA_3_2_1B_INST_Q4_0` — an exported registry descriptor (~773 MB), cached in
  `~/.qvac/models`. `modelType` is inferred from the descriptor. Many other models exist
  (Whisper STT, embeddings, translation, TTS, OCR, image-gen) — we use the LLM.
- **API used** (see [`server/src/qvac/engine.ts`](../server/src/qvac/engine.ts)):
  ```js
  import * as qvac from "@qvac/sdk";
  const modelId = await qvac.loadModel({ modelSrc: qvac.LLAMA_3_2_1B_INST_Q4_0, onProgress });
  const run = qvac.completion({ modelId, history, stream: true });
  for await (const ev of run.events) if (ev.type === "contentDelta") yield ev.text; // stream
  await qvac.unloadModel({ modelId });
  ```
  We prefer the canonical `run.events` (`contentDelta`) surface and fall back to the legacy
  `run.tokenStream`. Everything runs in a local Bare worker — **no network egress**.

## WDK — `@tetherto/wdk-wallet-evm` (self-custodial wallets)

- **Version:** 1.0.0-beta.15 · **note:** the core package is `@tetherto/wdk` (NOT `wdk-core`).
  Depends on `ethers` 6.x under the hood.
- **API used** (see [`server/src/wdk/wallet.ts`](../server/src/wdk/wallet.ts)):
  ```js
  import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
  const account = new WalletAccountEvm(mnemonic, "0'/0/0", { provider: "http://127.0.0.1:8545" });
  await account.getAddress();
  await account.getTokenBalance(usdt);                       // ERC-20 balance (base units)
  await account.approve({ token: usdt, spender: pool, amount });
  await account.sendTransaction({ to: pool, value: 0n, data }); // ARBITRARY contract call
  ```
- **The key capability:** `sendTransaction({ to, value, data })` accepts raw calldata, so a WDK
  account can invoke **any** method on our own Solidity contract — this is exactly how WDK's own
  `approve()` is implemented internally. That's what lets us drive a trustless on-chain escrow pool
  (`deposit(homeGoals, awayGoals)`) with self-custodial signatures.
- **Provider:** the `provider` field accepts a plain RPC URL, so it works against local `anvil`
  (chainId 31337) and public testnets (Sepolia, Arbitrum Sepolia, …) with no code change.
- **Derivation:** WDK's relative `"0'/0/0"` → `m/44'/60'/0'/0/0`, which matches viem's default path
  (used by the resilience fallback so it derives the same address from the same seed).

## USDt

- Local demo: our own `MockUSDT` (6 decimals) — WDK reads/transfers any standard ERC-20 by address,
  nothing is token-hardcoded.
- Testnet/mainnet: point `GAFFER_USDT_ADDRESS` at real USDT/USD₮0. (`@tetherto/wdk-protocol-bridge-usdt0-evm`
  additionally enables cross-chain USD₮0 bridging — out of scope for this build.)
