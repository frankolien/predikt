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
  defineChain,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { config, TEST_MNEMONIC } from '../config.js';

export const chain = defineChain({
  id: config.chainId,
  name: config.mode === 'local' ? 'gaffer-local' : 'gaffer-testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

export const operatorAccount: Account =
  config.mode === 'local'
    ? mnemonicToAccount(TEST_MNEMONIC) // anvil #0, pre-funded with ETH
    : privateKeyToAccount(
        config.operatorKey ??
          (() => {
            throw new Error('GAFFER_OPERATOR_KEY is required in testnet mode');
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
