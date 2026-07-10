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

### Layer C (future) — gasless (pairs with the winners)
- WDK ERC-4337 smart accounts + a paymaster (`@tetherto/wdk-...-erc-4337`) so the
  user never needs ETH — closes the second gap from the competitive read.

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
