/**
 * Loads compiled contract artifacts (ABI + bytecode) produced by `forge build`.
 * Run `npm run contracts:build` first (the demo script does this for you).
 */
import { readFileSync } from 'node:fs';
import type { Abi } from 'viem';

interface Artifact {
  abi: Abi;
  bytecode: `0x${string}`;
}

function load(contract: string): Artifact {
  const url = new URL(`../../../contracts/out/${contract}.sol/${contract}.json`, import.meta.url);
  let json: any;
  try {
    json = JSON.parse(readFileSync(url, 'utf8'));
  } catch (err) {
    throw new Error(
      `Missing artifact for ${contract}. Run "npm run contracts:build" first. (${(err as Error).message})`,
    );
  }
  return { abi: json.abi as Abi, bytecode: json.bytecode.object as `0x${string}` };
}

export const MockUSDT = load('MockUSDT');
export const PredictionPool = load('PredictionPool');
