/**
 * Client-side signing primitives (viem, in the browser/webview).
 *
 * The seed lives only on this device (vault / keychain). Everything here derives
 * the account and signs LOCALLY — login challenges and transactions — so the seed
 * and the private key never leave the machine. WDK derives m/44'/60'/0'/0/0;
 * viem's default (addressIndex 0) is identical, so the address matches the wallet
 * the server used to see. See docs/custody-plan.md.
 */
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import { encodeFunctionData, type Address, type Hex } from "viem";

/** A fresh 12-word BIP-39 recovery phrase, generated on-device. */
export function newMnemonic(): string {
  return generateMnemonic(english);
}

/** The wallet address for a phrase (same derivation as the server's WDK path). */
export function addressFromMnemonic(mnemonic: string): Address {
  return mnemonicToAccount(mnemonic.trim(), { addressIndex: 0 }).address;
}

/** Sign a login/registration challenge (EIP-191 / SIWE) with the local key. */
export async function signMessage(mnemonic: string, message: string): Promise<Hex> {
  return mnemonicToAccount(mnemonic.trim(), { addressIndex: 0 }).signMessage({ message });
}

/** Read-only chain data the server hands us to build a tx (see /api/tx/prepare). */
export interface PreparedTx {
  chainId: number;
  nonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * Sign a transaction LOCALLY and return the serialized raw tx to relay. The server
 * only supplied nonce/gas/chainId; we own to/data/value, so a lying server can't
 * make us sign a transfer we didn't intend.
 */
export async function signTx(
  mnemonic: string,
  tx: { to: Address; data?: Hex; value?: bigint },
  prep: PreparedTx,
): Promise<Hex> {
  const account = mnemonicToAccount(mnemonic.trim(), { addressIndex: 0 });
  return account.signTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
    chainId: prep.chainId,
    nonce: prep.nonce,
    gas: BigInt(prep.gas),
    maxFeePerGas: BigInt(prep.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(prep.maxPriorityFeePerGas),
    type: "eip1559",
  });
}

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Calldata for an ERC-20 transfer (USD₮ is 6-decimals; see usdtBase). */
export function erc20TransferData(to: Address, amountBase: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, amountBase] });
}

/** Human USD₮ (e.g. 5) → 6-decimal base units. */
export function usdtBase(human: number): bigint {
  return BigInt(Math.round(human * 1e6));
}
