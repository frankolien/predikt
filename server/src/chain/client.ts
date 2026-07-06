/**
 * viem clients for the chain.
 *
 * - publicClient: reads (balances, contract views) — used for anyone.
 * - operator wallet: the tournament host / result oracle. Deploys MockUSDT and
 *   per-fixture pools, funds demo wallets with gas, and posts final scores.
 *   It never custodies fan stakes — the PredictionPool contract does.
 *
 * Fan wallets are NOT here — those are self-custodial WDK accounts (see ../wdk).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
  type Account,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { config, TEST_MNEMONIC } from '../config.js';

// The active network's chain (see config.network), with the configured RPC —
// env override (GAFFER_RPC_URL) or the preset default.
export const chain: Chain = {
  ...config.network.chain,
  id: config.chainId,
  rpcUrls: { default: { http: [config.rpcUrl] } },
};

export const operatorAccount: Account =
  config.mode === 'local'
    ? mnemonicToAccount(TEST_MNEMONIC) // anvil #0, pre-funded with ETH
    : privateKeyToAccount(
        config.operatorKey ??
          (() => {
            throw new Error(`GAFFER_OPERATOR_KEY is required on ${config.network.label}`);
          })(),
      );

export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

export const operatorWallet: WalletClient = createWalletClient({
  account: operatorAccount,
  chain,
  transport: http(config.rpcUrl),
});

/** Convert human USDt (e.g. 5) to 6-decimal base units. */
export function usdt(human: number): bigint {
  return BigInt(Math.round(human * 10 ** config.usdtDecimals));
}

/** Convert base units back to human USDt number. */
export function fromUsdt(base: bigint): number {
  return Number(base) / 10 ** config.usdtDecimals;
}
