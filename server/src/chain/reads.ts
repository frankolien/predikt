/**
 * Read-only chain queries (no signing) via viem publicClient.
 */
import type { Address } from 'viem';
import { publicClient } from './client.js';
import * as artifacts from './artifacts.js';

export async function usdtBalance(token: Address, who: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: artifacts.MockUSDT.abi,
    functionName: 'balanceOf',
    args: [who],
  }) as Promise<bigint>;
}

export interface OnChainEntry {
  homeGoals: number;
  awayGoals: number;
  amount: bigint;
  exists: boolean;
}

export async function poolPot(pool: Address): Promise<bigint> {
  return publicClient.readContract({
    address: pool,
    abi: artifacts.PredictionPool.abi,
    functionName: 'pot',
  }) as Promise<bigint>;
}

export async function poolSettled(pool: Address): Promise<boolean> {
  return publicClient.readContract({
    address: pool,
    abi: artifacts.PredictionPool.abi,
    functionName: 'settled',
  }) as Promise<boolean>;
}

export async function poolPlayers(pool: Address): Promise<Address[]> {
  return publicClient.readContract({
    address: pool,
    abi: artifacts.PredictionPool.abi,
    functionName: 'getPlayers',
  }) as Promise<Address[]>;
}

export async function poolEntry(pool: Address, who: Address): Promise<OnChainEntry> {
  const [homeGoals, awayGoals, amount, exists] = (await publicClient.readContract({
    address: pool,
    abi: artifacts.PredictionPool.abi,
    functionName: 'getEntry',
    args: [who],
  })) as [number, number, bigint, boolean];
  return { homeGoals, awayGoals, amount, exists };
}
