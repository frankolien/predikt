/**
 * Layer C — gasless sends/buy-ins via ERC-4337 + Candide's USD₮ paymaster (EIP-7702).
 *
 * The fan's EOA (the same M1 self-custody key) delegates to smart-account code via
 * EIP-7702, so the ADDRESS is unchanged — everything identity keys to
 * `users.walletAddress` (balances, memberships) stays put; there is no migration.
 * The action becomes a UserOperation whose gas is paid in USD₮ by Candide's
 * paymaster, so the fan never needs ETH and there is no operator gas tank to run dry
 * (the exact failure that broke a testnet send on 2026-07-10).
 *
 * Custody is preserved: the UserOp is signed LOCALLY with the fan's key (never sent);
 * only the SUBMISSION path changes from "raw tx → our relay" (M1) to "UserOp →
 * bundler" (here). Gasless is enabled ONLY when the active network advertises BOTH a
 * bundler and a paymaster (NetworkInfo.bundler/paymaster from /api/health, set from
 * GAFFER_BUNDLER_URL_* / GAFFER_PAYMASTER_URL_*); otherwise callers transparently
 * fall back to the M1 EOA-sign→relay path — so this is inert until Candide keys are
 * configured. abstractionkit is lazy-imported so it (and its ethers dep) load only on
 * the gasless path, never in the main bundle.
 *
 * See docs/custody-plan.md §10.
 */
import type { Address } from "viem";
import type { NetworkInfo } from "./api";
import * as signer from "./signer";

/** Everything the gasless path needs, resolved from the active network's health. */
export interface GaslessConfig {
  bundler: string; // ERC-4337 bundler RPC (Candide)
  paymaster: string; // Candide ERC-20 (USD₮) paymaster RPC
  usdt: Address; // the stake/send token == the paymaster's gas token
  chainId: number;
}

/**
 * Gasless is available for a network iff it advertises a bundler AND a paymaster AND
 * a USD₮ token. Returns null (⇒ use the M1 relay) whenever any is missing — which is
 * every network until the Candide endpoints are configured on the server.
 */
export function gaslessConfigFor(net: NetworkInfo | null | undefined): GaslessConfig | null {
  if (!net?.bundler || !net?.paymaster || !net?.usdt) return null;
  return { bundler: net.bundler, paymaster: net.paymaster, usdt: net.usdt as Address, chainId: net.chainId };
}

/**
 * Send USD₮ gaslessly: build the ERC-20 transfer as a UserOperation, have Candide's
 * paymaster cover gas in USD₮ (the approve is batched into the same op), sign locally,
 * submit to the bundler, and return the settled on-chain tx hash. That settlement is
 * a normal ERC-20 Transfer(from = the fan's address, to = recipient), so the
 * server's on-chain buy-in verify (escrow.verifyDeposit) works unchanged.
 *
 * Throws on any failure so the caller can fall back to the M1 EOA-sign→relay path;
 * gasless is strictly additive on top of M1 (docs/custody-plan.md §10.6).
 */
export async function sendUsdtGasless(
  mnemonic: string,
  to: Address,
  amountHuman: number,
  cfg: GaslessConfig,
): Promise<{ hash: string }> {
  const { Simple7702AccountV09, CandidePaymaster, createAndSignEip7702DelegationAuthorization } = await import(
    "abstractionkit"
  );
  const owner = signer.addressFromMnemonic(mnemonic);
  const key = signer.privateKeyFromMnemonic(mnemonic);
  const chainId = BigInt(cfg.chainId);

  // The 7702 smart account IS the fan's EOA (same address) with smart-account powers.
  // EntryPoint v0.9 — Candide's Arbitrum bundler rejects v0.8 7702 ops (opaque
  // SIMULATE_VALIDATION error) but accepts v0.9; verified live on Arbitrum One.
  const account = new Simple7702AccountV09(owner);
  const transfer = {
    to: cfg.usdt,
    value: 0n,
    data: signer.erc20TransferData(to, signer.usdtBase(amountHuman)),
  };

  // 1. Build the UserOp. On the FIRST op the EOA isn't yet delegated, so we attach +
  //    sign an EIP-7702 delegation authorization (locally, with the fan's key); once
  //    delegated, createUserOperation returns a null auth and we skip it.
  let userOp = await account.createUserOperation([transfer], cfg.bundler, cfg.bundler, {
    eip7702Auth: { chainId },
  });
  if (userOp.eip7702Auth) {
    userOp.eip7702Auth = createAndSignEip7702DelegationAuthorization(
      BigInt(userOp.eip7702Auth.chainId),
      userOp.eip7702Auth.address,
      BigInt(userOp.eip7702Auth.nonce),
      key,
    );
  }

  // 2. Gas-in-USD₮: Candide's ERC-20 paymaster sponsors gas by pulling a little of
  //    the fan's USD₮ (the approve is batched in) — no ETH anywhere, nothing to run
  //    dry. `tokenQuote` is the USD₮ gas cost, surfaced honestly in the UI (§10.9).
  const paymaster = new CandidePaymaster(cfg.paymaster);
  const sponsored = await paymaster.createTokenPaymasterUserOperation(account, userOp, cfg.usdt, cfg.bundler);
  userOp = sponsored.userOperation;

  // 3. Sign LOCALLY (userOpHash) — the key never leaves here.
  userOp.signature = account.signUserOperation(userOp, key, chainId);

  // 4. Submit through the bundler and wait for the on-chain receipt.
  const resp = await account.sendUserOperation(userOp, cfg.bundler);
  const result = await resp.included();
  if (!result) throw new Error("gasless operation was not included on-chain");
  return { hash: result.receipt.transactionHash };
}
