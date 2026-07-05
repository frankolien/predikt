/**
 * Generic USD₮ escrow — the money leg shared by pools, cups and leagues.
 *
 * Buy-ins are collected by the fan's own WDK wallet transferring USD₮ to the
 * treasury (operator); payouts are the treasury transferring USD₮ back to
 * winners. Real ERC-20 transfers on every leg, so each returns a tx hash. The
 * pot itself is tracked off-chain in the store (amounts in µUSD₮), settled with
 * the SAME pure math as the points path — only the rails differ.
 *
 * (A trustless per-pot escrow contract is the productionization; treasury escrow
 * keeps the demo simple while still moving real on-chain USD₮ through WDK.)
 */
import type { Address } from 'viem';
import { operatorAccount } from '../chain/client.js';
import { payoutUsdt } from '../chain/ops.js';
import { transferUsdt } from './wallet.js';
import * as manager from '../pool/manager.js';
import { config } from '../config.js';

export function ready(): boolean {
  return manager.isReady();
}
export function treasury(): Address {
  return operatorAccount.address;
}
export function token(): Address {
  return manager.usdtToken() as Address;
}

export const toBase = (human: number): bigint => BigInt(Math.round(human * 10 ** config.usdtDecimals));
export const toHuman = (base: bigint): number => Number(base) / 10 ** config.usdtDecimals;

/** Collect a buy-in from a fan's self-custodial wallet into the treasury. */
export async function collect(fromAddress: string, amountBase: bigint): Promise<string> {
  if (!ready()) throw new Error('the USD₮ rail is still warming up — try again in a moment');
  const { txHash } = await transferUsdt({
    from: fromAddress as Address,
    token: token(),
    to: treasury(),
    amount: amountBase,
  });
  return txHash;
}

/** Pay a winner from the treasury. */
export async function pay(toAddress: string, amountBase: bigint): Promise<string> {
  if (!ready()) throw new Error('the USD₮ rail is not ready');
  return payoutUsdt(token(), toAddress as Address, amountBase);
}
