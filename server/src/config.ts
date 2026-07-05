/**
 * Runtime configuration.
 *
 * Two modes:
 *  - local (default): a local `anvil` chain + a MockUSDT we deploy. Fully
 *    offline, deterministic, zero real funds — ideal for a judge to run.
 *  - testnet: point at a real testnet RPC + a real USD₮0/USDT token address.
 *
 * The "operator" account is the tournament host: it deploys the MockUSDT and
 * per-fixture PredictionPool contracts and acts as the result oracle. It never
 * custodies fan funds — the pool contract does. Locally it's anvil account #0,
 * derived from the standard test mnemonic (so it's pre-funded with ETH).
 */

export type Mode = 'local' | 'testnet';

export const MODE: Mode = (process.env.GAFFER_MODE as Mode) || 'local';

/** Standard anvil/hardhat deterministic mnemonic — accounts are pre-funded with ETH. */
export const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

export const config = {
  mode: MODE,
  port: Number(process.env.PORT || 8787),
  rpcUrl: process.env.GAFFER_RPC_URL || 'http://127.0.0.1:8545',
  chainId: Number(process.env.GAFFER_CHAIN_ID || (MODE === 'local' ? 31337 : 11155111)),
  usdtDecimals: 6,
  /**
   * In local mode the operator key comes from the test mnemonic (anvil #0).
   * In testnet mode set GAFFER_OPERATOR_KEY to a funded key.
   */
  operatorKey: process.env.GAFFER_OPERATOR_KEY as `0x${string}` | undefined,
  /** Testnet USDT/USD₮0 token address; in local mode this is filled by deploy. */
  usdtAddress: process.env.GAFFER_USDT_ADDRESS as `0x${string}` | undefined,
} as const;

/** Where the local deploy step records freshly-deployed contract addresses. */
export const DEPLOYMENTS_PATH = new URL('../../deployments.local.json', import.meta.url).pathname;
