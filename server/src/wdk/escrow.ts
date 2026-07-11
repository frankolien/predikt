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
import { parseEventLogs, type Address, type Hex } from 'viem';
import { operatorAccount, publicClient } from '../chain/client.js';
import { payoutUsdt } from '../chain/ops.js';
import * as manager from '../pool/manager.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { consumedDeposits } from '../db/schema.js';

const TRANSFER_EVENT = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

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

/**
 * Client-side custody: verify a buy-in the FAN already signed + broadcast, instead
 * of the server signing it. The client transferred `amountBase` USD₮ to the treasury
 * and hands us the tx hash; we check it on-chain and consume it single-use. Returns
 * the verified hash to record, or throws. Non-negotiables (docs/custody-plan.md §5):
 * exact amount to the treasury from the fan, not older than the target, atomic
 * single-use (the tx_hash primary key IS the lock).
 */
export async function verifyDeposit(opts: {
  txHash: string;
  from: string; // the fan's wallet — must be the tx's token sender
  amountBase: bigint; // must equal the buy-in exactly
  purpose: string; // 'pool:<id>' | 'cup:<id>' | 'league:<id>'
  userId: string;
  notBefore?: Date; // reject a transfer mined before the target existed
}): Promise<string> {
  const txHash = (opts.txHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error('a signed USD₮ deposit is required to join');
  const hash = txHash as Hex;

  // 1. the deposit tx must exist on-chain and have succeeded
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash });
  } catch {
    throw new Error('deposit not found on-chain yet — give it a moment and retry');
  }
  if (receipt.status !== 'success') throw new Error('your deposit transaction failed on-chain');

  // 2. it must not predate the pool/round (no replaying an old transfer-to-treasury)
  if (opts.notBefore) {
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    if (Number(block.timestamp) * 1000 < opts.notBefore.getTime() - 60_000) {
      throw new Error('that deposit predates this buy-in — make a fresh deposit');
    }
  }

  // 3. it must be exactly a Transfer(from = fan, to = treasury, value = buy-in) of our USD₮
  const tokenAddr = token();
  const transfers = parseEventLogs({ abi: TRANSFER_EVENT, eventName: 'Transfer', logs: receipt.logs }).filter(
    (l) => (l.address as string).toLowerCase() === tokenAddr.toLowerCase(),
  );
  const match = transfers.find(
    (l) =>
      (l.args.from as string).toLowerCase() === opts.from.toLowerCase() &&
      (l.args.to as string).toLowerCase() === treasury().toLowerCase() &&
      (l.args.value as bigint) === opts.amountBase,
  );
  if (!match) throw new Error('deposit does not match this buy-in (wrong amount or destination)');

  // 4. consume it single-use — the primary key insert IS the atomic replay lock
  try {
    await db.insert(consumedDeposits).values({ txHash, userId: opts.userId, purpose: opts.purpose, createdAt: new Date() });
  } catch {
    throw new Error('this deposit has already been used');
  }
  return txHash;
}

/** Pay a winner from the treasury. */
export async function pay(toAddress: string, amountBase: bigint): Promise<string> {
  if (!ready()) throw new Error('the USD₮ rail is not ready');
  return payoutUsdt(token(), toAddress as Address, amountBase);
}
