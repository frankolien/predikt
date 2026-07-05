/**
 * Operator/oracle chain operations: deploy contracts, fund demo wallets, mint
 * demo USDt, and settle pools. All signed by the operator account.
 */
import { parseEther, type Address, type Hex } from 'viem';
import { publicClient, operatorWallet, operatorAccount, chain } from './client.js';
import * as artifacts from './artifacts.js';

async function waitFor(hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function deployMockUsdt(): Promise<Address> {
  const hash = await operatorWallet.deployContract({
    abi: artifacts.MockUSDT.abi,
    bytecode: artifacts.MockUSDT.bytecode,
    account: operatorAccount,
    chain,
    args: [],
  });
  const receipt = await waitFor(hash);
  if (!receipt.contractAddress) throw new Error('MockUSDT deploy: no contract address');
  return receipt.contractAddress;
}

export interface PoolDeployArgs {
  token: Address;
  settler: Address;
  stake: bigint;
  lockTime: bigint;
  refundDeadline: bigint;
  fixtureId: Hex; // bytes32
}

export async function deployPool(a: PoolDeployArgs): Promise<Address> {
  const hash = await operatorWallet.deployContract({
    abi: artifacts.PredictionPool.abi,
    bytecode: artifacts.PredictionPool.bytecode,
    account: operatorAccount,
    chain,
    args: [a.token, a.settler, a.stake, a.lockTime, a.refundDeadline, a.fixtureId],
  });
  const receipt = await waitFor(hash);
  if (!receipt.contractAddress) throw new Error('PredictionPool deploy: no contract address');
  return receipt.contractAddress;
}

/** Send native ETH so a self-custodial fan wallet can pay gas (local/testnet). */
export async function fundGas(to: Address, eth = '1'): Promise<Hex> {
  const hash = await operatorWallet.sendTransaction({
    account: operatorAccount,
    chain,
    to,
    value: parseEther(eth),
  });
  await waitFor(hash);
  return hash;
}

/** Mint demo USDt to an address (MockUSDT only — play money). */
export async function mintUsdt(token: Address, to: Address, amount: bigint): Promise<Hex> {
  const hash = await operatorWallet.writeContract({
    address: token,
    abi: artifacts.MockUSDT.abi,
    functionName: 'mint',
    args: [to, amount],
    account: operatorAccount,
    chain,
  });
  await waitFor(hash);
  return hash;
}

/** Treasury (operator) pays USDt out to a winner — the payout leg of escrow. */
export async function payoutUsdt(token: Address, to: Address, amount: bigint): Promise<Hex> {
  const hash = await operatorWallet.writeContract({
    address: token,
    abi: artifacts.MockUSDT.abi,
    functionName: 'transfer',
    args: [to, amount],
    account: operatorAccount,
    chain,
  });
  await waitFor(hash);
  return hash;
}

/** Oracle posts the final score; the contract distributes the pot by rule. */
export async function settlePoolOnChain(pool: Address, homeGoals: number, awayGoals: number): Promise<Hex> {
  const hash = await operatorWallet.writeContract({
    address: pool,
    abi: artifacts.PredictionPool.abi,
    functionName: 'settle',
    args: [homeGoals, awayGoals],
    account: operatorAccount,
    chain,
  });
  await waitFor(hash);
  return hash;
}
