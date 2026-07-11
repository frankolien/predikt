# Predikt — Client-Side Custody Plan

**Goal:** make this claim literally true, end to end —
> *The seed never reaches our servers. Every transaction is signed on the user's device. The backend is architecturally incapable of moving a user's funds.*

This is the one place Predikt is measurably behind the other top-16 WDK projects
(Mimic, La Doce, Quorum all headline client-side self-custody + a server that
*cannot* touch funds). Closing it turns our biggest liability into a strength.

Status: **design — no code yet.** Nothing here is implemented until approved.

---

## 1. Current state — the exact gap

The seed is already generated and stored **on-device**:

- Web → [`web/src/lib/vault.ts`](../web/src/lib/vault.ts): PIN-encrypted (PBKDF2 → AES-GCM), localStorage, never plaintext.
- Desktop → [`web/src/lib/keychain.ts`](../web/src/lib/keychain.ts): OS keychain.

But two things break the custody claim:

1. **The seed is transmitted to the server.** `POST /api/auth/wallet/restore`
   (and the wallet-link path) sends the 12-word phrase; `walletAuth.signInWithMnemonic`
   → `manager.importWallet` → `wallet.importFan` stores the mnemonic in the server's
   in-memory `fans` map ([`server/src/wdk/wallet.ts`](../server/src/wdk/wallet.ts)).
2. **The server signs every user transaction** with that held mnemonic:
   - Send → `POST /api/account/send` → `transferUsdt(...)`
   - Buy-ins → `escrow.collect(addr, amount)` in `store/pools.ts:125`,
     `fantasy/store.ts:491`, `organize/store.ts:144` (all: fan → treasury USD₮ transfer).

**Kill (1) and (2) and the claim is true.** Everything else (the vault, the
address-keyed accounts, the deterministic derivation) already supports it.

---

## 2. Custody boundary (what we're proving)

| Key | Who holds it | Can move whose funds | After this plan |
|---|---|---|---|
| **Fan seed** | user's device only | the user's own wallet | never sent, never on server ✅ |
| **Operator key** | server | the operator/treasury account (a *platform* account) | unchanged — **not user custody** |

The operator key stays server-side. It is used for: contract deploys, the gas
faucet (funding *addresses*, not spending from them), settlement (posting scores),
and payouts. It **cannot** move funds out of a user's wallet — only the user's
own key can. That is exactly the boundary the winning projects draw.

> **Out of scope for this plan (named for honesty):** the treasury-escrow *pot*
> (cups/leagues) is held by the operator between buy-in and payout, so the operator
> is custodial *of the pot* (not of wallets). Predict's original `PredictionPool`
> contract already holds its pot trustlessly. Extending trustless per-pool escrow
> to cups/leagues is **Layer B** — a separate follow-up. This plan is **Layer A:
> wallet self-custody**, the headline claim.

---

## 3. Target architecture

```
┌──────────────────────────── device (browser / desktop webview) ────────────────────────────┐
│  seed (vault/keychain)  ──►  viem account (m/44'/60'/0'/0/0 = same addr as WDK)              │
│        │                                                                                     │
│        ├─ sign login challenge (EIP-191)                                                     │
│        └─ sign txs locally (send, buy-ins) → serialized raw tx                               │
└───────────────┬───────────────────────────────────────────────┬─────────────────────────────┘
                │ address + signature (never the seed)           │ signed raw tx
                ▼                                                 ▼
        POST /auth/challenge → nonce                       POST /tx/prepare  (read nonce/gas)
        POST /auth/verify    → session                     POST /tx/relay    (broadcast raw)
                                                           POST /*/join      (txHash → verify on-chain)
                ▲                                                 │
                └──────────── server: reads chain, relays, verifies, records ──── operator key (platform only)
```

- **Client signs with viem.** WDK derives `m/44'/60'/0'/0/0`; viem's
  `mnemonicToAccount(mnemonic, { addressIndex: 0 })` is identical (already our
  server-side fallback), so the address is the same and viem is browser-safe. No
  new derivation, no WDK-in-browser bundling risk.
- **Server never sees the key** — only signatures and pre-signed raw txs.
- **Server relays + verifies** so the browser never has to talk to a public RPC
  directly (avoids CORS/rate-limit flakiness) and so the server can read receipts
  for its off-chain bookkeeping.

---

## 4. Detailed design

### 4.1 Sign-up (client-generate, register address only)

**Now:** `POST /api/auth/wallet/new` → server generates the seed, returns it once.
**New:** the *client* generates the seed (viem `generateMnemonic`), derives the
address, saves the seed to the vault/keychain, and registers only the address.

```
Client:  mnemonic = generateMnemonic(english)
         address  = mnemonicToAccount(mnemonic).address
         saveSeed(mnemonic, pin)              // vault / keychain
         sig = account.signMessage({ message: `Predikt sign-up: ${address}` })
POST /api/auth/wallet/register { address, handle?, signature }
Server:  verifyMessage(...) → address owns the key → insertUser(address) → session
         (background) manager.fundWallet(address)   // gas + demo USD₮, faucet nets
```

The phrase-reveal UI stays (user must back it up) — but the phrase is produced
locally and never leaves the device.

### 4.2 Auth — challenge / verify (replaces sending the phrase)

**The login message is EIP-4361 (SIWE)** — not a custom string. SIWE domain-binds
the signature, so a phishing origin can't relay a signature the user produced
elsewhere (the `domain`/`uri` in the signed message must match ours or the server
rejects it). Same effort, standard, interoperable.

```
POST /api/auth/challenge  { address }
  → { message, nonce }              // message = a SIWE (EIP-4361) statement:
                                    //   <domain> wants you to sign in with your Ethereum account:
                                    //   <address>
                                    //   Sign in to Predikt.
                                    //   URI: <origin>  Version: 1  Chain ID: <id>
                                    //   Nonce: <n>  Issued At: <ts>  Expiration Time: <ts+5m>
                                    // nonce: single-use, 5-min TTL, bound to address

Client: signature = account.signMessage({ message })

POST /api/auth/verify     { message, signature }
Server: parse SIWE  → assert domain/uri == ours, chainId ok, not expired
        assert nonce is live + unused for this address
        verifySiweMessage / verifyMessage({ address, message, signature })  (viem)
        consume nonce
        → resume account by address (or adopt if unseen) → session token
```

- Nonces: a small `auth_challenges` table (or in-memory map with TTL) —
  `{ address, nonce, expiresAt, used }`. Single-use prevents replay.
- Restore-on-another-device = the same flow after the user re-enters their phrase
  into the vault locally. The phrase still never hits the wire.
- Sign-up (§4.1) uses the SAME SIWE statement (nonce included), so registration and
  login share one verify path.

### 4.3 Transaction relay (server broadcasts, never signs)

Two tiny read/relay endpoints let the browser stay off the public RPC:

```
POST /api/tx/prepare  { from, to, data?, value? }
  → { nonce, chainId, maxFeePerGas, maxPriorityFeePerGas, gas }   // read-only chain state

Client: raw = account.signTransaction({ to, data, value, ...prepared })   // signed locally

POST /api/tx/relay    { rawTx }
  → { hash }            // server: publicClient.sendRawTransaction({ serializedTransaction: rawTx })
                        //         then waits for receipt, returns hash
```

The server sees a **signed** transaction; it cannot alter it (signature covers
to/value/data/nonce/chainId) and cannot produce one. `prepare` is honest read-only
data; if a malicious server lied about `to`, the signature wouldn't match what the
user intended — so the client builds `to`/`data`/`value` itself and only trusts
the server for `nonce`/`gas`/`chainId` (which it can re-check against the RPC).

**Relay is a liveness/censorship dependency, not a custody one** (the server only
rebroadcasts a pre-signed tx). To make sure a down or hostile relay can never
strand a user holding a signed tx they can't post, ship a **direct-RPC escape
hatch** behind an advanced toggle: the client broadcasts the same signed raw tx to
a user-configured/public RPC itself. Relay is the default (robust); the escape
hatch guarantees no single point of censorship. This is strictly stronger than
plain relay and doesn't weaken custody.

### 4.4 Send (client-signed)

`POST /api/account/send` (server-signs) is **removed**. Replaced by client flow:

```
Client: data = encodeFunctionData(erc20.transfer, [to, amount])
        prepared = POST /tx/prepare { from, to: usdtToken, data }
        raw = signTransaction({ to: usdtToken, data, ...prepared })
        { hash } = POST /tx/relay { raw }
        refresh balance
```

USD₮ token address + active network come from `/api/health` (already exposed via
the network switch work). Gas: operator faucet tops up the fan address on faucet
nets (unchanged); mainnet → user funds own gas (or Layer-C ERC-4337, below).

### 4.5 Buy-ins (client-sign → server verify on-chain) — uniform across modules

All three (`pools/join`, `tournaments/join`, `fantasy/leagues/join`) today call
`escrow.collect(addr, amount)` = fan→treasury transfer. New shape:

```
Client (before calling join):
   data = encodeFunctionData(erc20.transfer, [treasury, buyIn])
   raw  = sign(...)  ;  { hash } = POST /tx/relay { raw }

POST /api/pools/join { poolId|code, prediction, depositTx: hash }   (same for cups/leagues)
Server verifies the deposit BEFORE recording:
   receipt = getTransactionReceipt(hash)  (status success)
   assert one ERC-20 Transfer log: from == authedUser.address, to == treasury(),
          token == usdtToken, value == buyIn
   assert hash not already consumed  (replay guard — see §5)
   → record membership with depositTx = hash  (no escrow.collect; the fan already paid)
```

`escrow.collect` (fan-signing) is deleted from the join paths; `escrow.pay`
(operator→winner payout) is unchanged. Points-currency pools are untouched
(no chain, no signing).

### 4.6 What is removed / what stays

- **Removed:** `/api/account/send` signing; `escrow.collect`'s fan-signing;
  `manager.importWallet`/`wallet.importFan`/`transferUsdt`/the server `fans` map
  (after M2) — the server no longer holds or uses any fan key.
- **Stays:** operator key (deploys, faucet, settlement, payouts); `manager.fundWallet`
  (funds an address, doesn't spend from it); all read paths.

---

## 5. Security details

- **Challenge nonce:** single-use, 5-min TTL, bound to the requesting address.
  SIWE domain/uri binding (§4.2) blocks cross-site signature relay.
- **Deposit verify — M2 non-negotiables** (so the lighter treasury path isn't a
  foot-gun):
  1. **Bind the txHash to the specific `poolId`/`code`** at verification (the join
     request names the target; a transfer can only satisfy the pool it was made for).
  2. **Consume atomically** — `consumed_deposits(tx_hash PRIMARY KEY)`; the insert
     is the lock, so one transfer can never fund two joins even under a race.
  3. **Require exact `buyIn`** — value must equal the pool/round's buy-in.
  4. **Reject any tx dated before the pool/round's creation** (block/timestamp) — a
     random old transfer-to-treasury can't be replayed as a fresh deposit.
  - Keep the **client join interface identical to the future escrow-contract shape**
    (`{ target, depositTx }`) so the Layer-B migration to per-pool escrow contracts
    costs almost nothing.
- **prepare/relay trust:** client owns `to`/`data`/`value`; server only supplies
  `nonce`/`gas`/`chainId`, which the client can sanity-check. Server cannot forge a
  signature. See §4.3 for the direct-RPC escape hatch (liveness, not custody).
- **Session:** unchanged (bearer token) — but now issued only after a verified
  signature, not after receiving a secret.

### 5.1 Residual risk — the vault itself (named honestly)

Custody moves the risk from *our server* to *the device vault*, and that vault is
where browser wallets actually lose money — **not** our concern to hand-wave:

- **Web:** the seed is only as safe as (a) the PIN's entropy and (b) the origin's
  resistance to XSS (a script on our origin could read localStorage + prompt for a
  PIN). This exposure is **web-only** and sits *outside* Layer A, but we say it out loud.
  - Mitigation: push the KDF cost hard — raise PBKDF2 iterations substantially (or
    move to **scrypt/Argon2** where the platform allows); offer a **longer passphrase**
    option (not just a 4–6 digit PIN) on web; strict CSP to shrink XSS surface.
- **Desktop:** the OS keychain is already the correct answer — the seed is never in
  web-reachable storage. So the real residual exposure is the web path only.

---

## 6. DB changes

- `auth_challenges` (address, nonce, expires_at, used) — or in-memory w/ TTL.
- `consumed_deposits` (tx_hash pk, user_id, purpose, created_at).
- No change to `users` / membership tables (they already store `walletAddress`,
  `depositTx`/`payoutTx`).

---

## 7. Milestones & acceptance

### M1 — the headline (auth + send)
- Client-generated seed; `register`/`challenge`/`verify` endpoints; `/tx/prepare` + `/tx/relay`.
- Send fully client-signed; `/api/account/send` removed.
- **Accept:** create account (seed never sent — verify in network tab), reload +
  PIN-unlock, send USD₮ on-chain with a real tx hash, all without the phrase or a
  raw key ever appearing in a request body.

### M2 — finish the claim (buy-ins) + delete the key store
- Convert all 3 buy-ins to client-sign → verify; add replay guards.
- Delete `wallet.importFan` / `transferUsdt` / the server `fans` map.
- **Accept:** join a USD₮ Predict pool, a cup, and a fantasy league — each with a
  client-signed deposit the server verifies; grep the server for any fan-key usage → none.

### Layer B (future) — trust-minimized pot
- Per-pool/cup/league escrow **contract** (extend `PredictionPool`) so the operator
  only *settles*, never holds the pot. Makes "the server can't touch the pot" true too.

### Layer C — gasless (full design in §10)
- WDK ERC-4337 smart accounts + a paymaster so the user never needs ETH, and there's
  no hand-refilled gas tank to run dry. Closes the second competitive gap. See §10.

---

## 8. Rollout & rollback

- Build behind a flag `VITE_CLIENT_CUSTODY` (client) + `GAFFER_CLIENT_CUSTODY`
  (server accepts the new endpoints). Old `restore(mnemonic)` path stays until M1
  is verified live, then is removed.
- Desktop + web share the signing layer; the only difference is vault vs keychain
  (already abstracted).
- Rollback = flip the flag; the server-sign path is untouched until we delete it in M2.

---

## 9. Decisions — FINALIZED (2026-07-10)

1. **Relay + direct-RPC escape hatch.** Relay is the default (robust, no
   browser-RPC flakiness); a client-side "broadcast via your own RPC" fallback
   behind an advanced toggle means a down/hostile relay never strands a user with a
   signed tx. Liveness win, no custody cost. (§4.3)
2. **Buy-in guard: treasury + consumed-txHash now, Layer B next — with a hardened
   verify.** The headline (M1) doesn't depend on this, so ship the lighter version;
   per-pool escrow contracts follow. The M2 verify **must** bind txHash↔pool, consume
   atomically (tx_hash PK), require exact buyIn, and reject pre-creation txs. Keep the
   client join interface identical to the escrow-contract shape so Layer B is cheap. (§5)
3. **Delete the server key path entirely at M2 close.** Keep it *only* as rollback
   through the M1→M2 transition, then remove `wallet.importFan` / `transferUsdt` /
   the `fans` map completely. A permanent fallback would quietly negate the claim.

**Absorbed into the design:** login uses **EIP-4361 (SIWE)** for domain-binding
(§4.2); the **vault/XSS residual risk** is named with mitigations (§5.1).

**Next:** build **M1** (lowest-risk, most demonstrable) behind the flag, verify live,
then M2. These three answers hold until M1 is verified.

---

## 10. Layer C — Gasless (design)

**Goal:** the fan never needs ETH, and there is **no hand-refilled gas tank to run
dry**. Real USD₮ becomes as frictionless as points.

**Why now (not theoretical):** on 2026-07-10 a real testnet send failed because the
operator gas tank was down to **0.000656 ETH** (each auto gas-drip needs 0.002). The
operator-funded-gas model is fragile: when it empties, *every* user's send silently
breaks. Points sidestep it (no chain); the fix for the *real-money* path is a
paymaster. This is also the **second competitive gap** — Mimic/La Doce/Quorum are all
gasless (Pimlico / Candide). This closes it.

### 10.1 Mechanism

The fan's action becomes an **ERC-4337 UserOperation** submitted through a **bundler**,
with a **paymaster** covering gas. Two paymaster modes, both keep "the fan never
touches ETH":

- **Gas-in-USD₮ (ERC-20 paymaster) — primary.** The paymaster takes a little of the
  fan's *USD₮* to pay the gas. **No platform ETH at all**, so nothing can dry up, and
  the fan only ever needs the USD₮ they already hold. (La Doce/Quorum do this via
  Candide.) This is the one that directly kills the failure we just hit.
- **Sponsored (verifying paymaster) — optional onboarding freebie.** The platform
  sponsors the fan's *first* action(s) so a brand-new wallet can act on zero balance.
  Still needs a funded paymaster, but it's a monitored service that rejects cleanly
  when low — not a silent hand-drip. Use sparingly (first send / first buy-in), then
  fall through to gas-in-USD₮.

### 10.2 WDK integration (verified available)

- Use **`@tetherto/wdk-wallet-evm-erc-4337`** (published, `1.0.0-beta.11` — the exact
  package Quorum uses; **not yet installed** — currently we ship `wdk-wallet-evm`
  `beta.15`, a plain EOA). This is *deeper* WDK usage, which the track rewards.
- The signer stays the fan's seed-derived key (M1 custody is preserved — the client
  still signs locally; only the *submission path* changes from "raw tx → our relay"
  to "UserOp → bundler+paymaster"). The server never gains a key.

### 10.3 The address-stability decision (the key call)

Predikt keys identity to the wallet **address** (`users.walletAddress`). A vanilla
ERC-4337 smart account has a **different** (counterfactual) address than the EOA, so
switching would move every user's identity + balance. Two ways out:

- **A — EIP-7702 (keep the same address).** The fan's existing EOA *delegates* to
  smart-account code, so the address is unchanged and gains gasless powers. Mimic's
  approach (`@tetherto/wdk` + 7702). Cleanest UX, one address across points/testnet/
  mainnet. **Verify:** 7702 (Pectra) support on Arbitrum + WDK's 7702 API.
- **B — Smart account as the canonical wallet (new address).** From day one on the
  real-money path, the fan's wallet *is* the ERC-4337 smart account (deterministically
  derived from the seed); identity keys to that address. No migration for new users;
  existing **testnet** EOAs stay EOA (testnet is demoted to a demo toggle anyway — see
  below), and **mainnet** uses smart accounts. Simplest to ship; matches Quorum.

Recommendation: **B for mainnet now** (greenfield, no migration, ships fast), keep an
eye on **A** to later unify addresses if 7702 on Arbitrum is solid.

### 10.4 How the two money modes end up

Pairs with the product reframe (Points | Real USD₮; testnet → demo toggle):

| Mode | Chain | Gas | Address |
|---|---|---|---|
| **Points** | none | n/a (off-chain) | — |
| **Real USD₮** | Arbitrum One | **paid in USD₮** (paymaster) | ERC-4337 smart account |
| **Testnet (demo)** | Arbitrum Sepolia | operator-drip (kept for judges) | EOA (M1) |

So the fragile drip only ever backs the *demo* toggle; the real path can't dry up.

### 10.5 Components & config

- **Bundler + paymaster provider** per network (Pimlico / Candide / Alchemy — pick one
  with an Arbitrum One ERC-20 (USD₮) paymaster). API keys via env
  (`GAFFER_BUNDLER_URL_ARBITRUM`, `GAFFER_PAYMASTER_URL_ARBITRUM`).
- **USD₮ approval:** an ERC-20 paymaster needs an allowance to pull gas-USD₮ — batch
  the approval into the first UserOp (AA lets you bundle approve + action).
- **Client:** a gasless signer path in `custody.ts` (build UserOp via the WDK 4337
  wallet → submit to the bundler). `sendUsdt` / `payBuyIn` branch: mainnet → gasless
  UserOp; testnet → the M1 EOA relay (fallback).
- **Server:** buy-in verify (§4.5/§5) is unchanged — it still reads the on-chain
  Transfer(from→treasury); a UserOp settles as a normal Transfer, so `verifyDeposit`
  just works. `/api/tx/prepare` + the operator drip stay for the testnet demo path.

### 10.6 Graceful fallback

If a chain/provider lacks a paymaster, or a UserOp fails, fall back to the M1
EOA-sign→relay path (operator-drip on testnet). Gasless is **additive** on top of M1;
custody holds either way.

### 10.7 Milestones

- **C1:** install `wdk-wallet-evm-erc-4337`; derive the smart-account address from the
  seed; register identity to it (mainnet path). Read balance on the smart account.
- **C2:** gasless **send** — build+submit a UserOp with the USD₮ paymaster (approve
  batched); confirm zero ETH needed. Verify on Arbitrum One with a tiny amount.
- **C3:** gasless **buy-ins** — route `payBuyIn` through the UserOp path; server verify
  unchanged. Optional sponsored first-action.

### 10.8 Open decisions — RESOLVED (2026-07-11)

1. **Paymaster provider → Candide.** Settled by the SDK: `@tetherto/wdk-wallet-evm-erc-4337`
   is built on `abstractionkit` (Candide's SDK, which ships `CandidePaymaster`). We use
   `abstractionkit` directly on the client (lighter, browser-safe) rather than the
   Node/Bare WDK wrapper. **Still needed from us:** a Candide **Arbitrum One bundler +
   USD₮ paymaster** endpoint/API key (env `GAFFER_BUNDLER_URL_ARBITRUM` /
   `GAFFER_PAYMASTER_URL_ARBITRUM`).
2. **7702 (A) vs smart-account (B) → A (EIP-7702).** Verified 7702 is live on Arbitrum
   One (ArbOS 40 "Callisto", Pectra) and `abstractionkit` ships `Simple7702Account`.
   Proven offline: the 7702 account address == the EOA address (`0xf39F…2266` → itself),
   so identity/`walletAddress` is **unchanged — zero migration**, one address across
   points/testnet/mainnet. (B — Safe — derived a *new* address `0xFD8A…8C01`; rejected.)
3. **Sponsor the first action?** Deferred — nice-to-have; add a verifying paymaster later.
4. **USD₮ vs USD₮0** on Arbitrum One — still to confirm; the paymaster's gas token must
   match the stake token (`GAFFER_USDT_ADDRESS_ARBITRUM`). Decide when wiring the endpoint.

### 10.9 Build status (2026-07-11) — C1 done, C2/C3 wired-but-untested-until-keys

- **C1 (done, offline-verified):** `abstractionkit@0.4.0` added to web (lazy-imported →
  its own 99 kB chunk, main bundle unchanged). Smart-account = EOA proven from a seed
  with zero network calls. Server exposes per-network `bundler`/`paymaster` from env
  (`chain/networks.ts` `bundlerUrlFor`/`paymasterUrlFor` → `NetworkDescriptor` → `/api/health`).
- **C2/C3 (written, type-checked against the real SDK, NOT yet run live):**
  [`web/src/lib/gasless.ts`](../web/src/lib/gasless.ts) — `sendUsdtGasless()`:
  `Simple7702Account.createUserOperation` → `CandidePaymaster.createTokenPaymasterUserOperation`
  (gas-in-USD₮, approve batched, exposes `tokenQuote`) → local `signUserOperation` →
  `sendUserOperation` → `included()`. `gaslessConfigFor(net)` returns null (⇒ M1 relay)
  until both endpoints are configured. Wired into the **buy-in** path (`payBuyIn`/`payBuyInFor`,
  self-contained via health) with a try/catch fallback to the M1 EOA relay — so it's
  **inert and deploy-safe today**, and gasless real-money stakes light up the moment the
  Candide endpoints are set on the server. Gasless **send** is a one-line follow-up (pass
  the active net's config from the Hub SendModal).
- **Untested-until-keys:** live bundler/paymaster round-trip (needs the Candide endpoint).
  Two spots to confirm on first live run: the `createUserOperation` provider-RPC arg (using
  the bundler URL for eth_* reads) and the 7702-authorization attachment inside `signUserOperation`.

**Candide endpoint verified (2026-07-11, read-only):** the Candide V3 **unified** endpoint
`https://api.candide.dev/api/v3/42161/<key>` (one URL for bundler + paymaster) is live —
`chainId` = 0xa4b1 (Arbitrum One); supported EntryPoints include **v0.8**
`0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (exactly what `Simple7702Account`/UserOperationV8
needs); supported ERC-20 gas tokens = USDC, **USDT `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`
(6 dp)**, DAI, XAUt0, EURe. So the stake/gas token is **canonical USD₮** (== our
`ARBITRUM_ONE_USDT` default; **no `GAFFER_USDT_ADDRESS_ARBITRUM` override needed**, USD₮0 not used).
Config: set `GAFFER_BUNDLER_URL_ARBITRUM` and `GAFFER_PAYMASTER_URL_ARBITRUM` both to the unified
endpoint. Note: gasless buy-ins engage only when the BOOT network is `arbitrum`
(GAFFER_NETWORK=arbitrum), since buy-ins settle on the boot chain.

**GASLESS PROVEN LIVE (2026-07-11) — Arbitrum One mainnet, zero-ETH wallet:** a sponsored 7702
UserOp from a brand-new empty wallet delegated the EOA and executed on-chain, gas paid entirely by
a Candide sponsorship policy. Tx `0x899fe309cf4ea4805ea0409fb6688f404ba269c53c8a2a2a730b21eba8cbb126`
(status success, 147k gas); the EOA gained delegation code `0xef0100…`. **Critical integration
finding — use EntryPoint v0.9, not v0.8:** `Simple7702Account` (EP v0.8) fails on Candide's Arbitrum
bundler with an opaque `SIMULATE_VALIDATION` error (returns the EntryPoint bytecode as the message);
`Simple7702AccountV09` (EP v0.9, `0x433709009B8330FDa32311DF1C2AFA402eD8D009`) works. Both
`gasless.ts` and `scripts/gasless-verify.mjs` now use `Simple7702AccountV09`. Everything else on the
client was verified correct (auth signature recovers to the EOA, delegatee `0xe6Cae83…`/v0.9
`0xa46cc63e…` deployed, abstractionkit serializes eip7702Auth into eth_sendUserOperation). Two
paymaster modes BOTH PROVEN live on Arbitrum One: **sponsored** (Candide gas policy pays — needs a
funded policy = a platform ETH tank) — tx `0x899fe309…`; **token/gas-in-USD₮** (fan pays gas in their
own USD₮, no platform ETH — the production path) — tx
`0x299ea2b3c89fc2d57b7c248e9d45cdb4703b5d6caf73c90a8fde8f83968c0ba0`, a wallet with ~0 ETH paid gas
in USD₮ (~1.6¢, tokenCost 15579), ETH balance unchanged. **This eliminates the operator-gas-tank
fragility from §10 entirely** (no ETH to run dry). Candide token list confirms USD₮ `0xFd086bC7…`
supported; the paymaster returns a `tokenQuote` (exchangeRate + tokenCost) = the honest USD₮ gas fee
to surface in the UI. Layer C gasless is DONE and on-chain-proven; remaining = commit + deploy (set
`GAFFER_BUNDLER_URL_ARBITRUM`/`GAFFER_PAYMASTER_URL_ARBITRUM` + `GAFFER_NETWORK=arbitrum`).

### 10.10 Risks

- 7702/AA support + WDK 4337 API maturity (beta) — verify before committing to A.
- Paymaster provider coverage for Arbitrum One + the chosen USD₮ token.
- ERC-20 paymaster economics (gas-USD₮ spread) — surface the tiny gas-in-USD₮ cost honestly in the UI.
