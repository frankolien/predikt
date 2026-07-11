/**
 * Live gasless verification on Arbitrum One via ERC-4337 + Candide (EIP-7702).
 * Mirrors web/src/lib/gasless.ts, with per-stage logging, to prove the write path
 * end-to-end before it's wired into the app. Your seed is read from a LOCAL env var
 * and never leaves this machine.
 *
 * Two modes:
 *   SPONSORED (set SPONSORSHIP_POLICY_ID) — the policy pays gas, so the wallet needs
 *     ZERO funds (no ETH, no USD₮). Sends a 0-value self-call — pure pipeline proof.
 *   TOKEN (no policy id) — gas paid in the fan's USD₮; needs a little USD₮ (no ETH).
 *
 *   ENDPOINT=https://api.candide.dev/api/v3/42161/<key> \
 *   GASLESS_SEED="twelve word phrase" \
 *   SPONSORSHIP_POLICY_ID=<id>   # omit for the USD₮ token-paymaster path \
 *   node scripts/gasless-verify.mjs
 */
import { mnemonicToAccount } from "viem/accounts";
import { createPublicClient, http, encodeFunctionData, formatUnits, toHex } from "viem";
import { Simple7702AccountV09, CandidePaymaster, createAndSignEip7702DelegationAuthorization } from "abstractionkit";

const EP = process.env.ENDPOINT;
const SEED = process.env.GASLESS_SEED;
const POLICY = process.env.SPONSORSHIP_POLICY_ID; // set ⇒ sponsored (no funds needed)
const AMOUNT = Number(process.env.AMOUNT ?? "0.05");

// NETWORK=arbitrum (mainnet, real money) | arbitrum-sepolia (testnet, free via faucet).
// Testnet only supports SPONSORED mode here (no canonical USD₮ paymaster token on Sepolia).
const NETS = {
  arbitrum: { chainId: 42161n, rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  "arbitrum-sepolia": { chainId: 421614n, rpc: "https://sepolia-rollup.arbitrum.io/rpc", explorer: "https://sepolia.arbiscan.io", usdt: undefined },
};
const NET = NETS[process.env.NETWORK ?? "arbitrum"];
if (!NET) throw new Error("NETWORK must be 'arbitrum' or 'arbitrum-sepolia'");
const { chainId: CHAIN_ID, rpc: RPC, explorer: EXPLORER, usdt: USDT } = NET;

if (!EP) throw new Error("set ENDPOINT to your Candide unified endpoint for this network");
if (!SEED) throw new Error("set GASLESS_SEED to the wallet's phrase (kept local)");
if (!POLICY && !USDT) throw new Error("testnet supports SPONSORED mode only — set SPONSORSHIP_POLICY_ID");

// JSON.stringify that tolerates BigInt (paymaster quotes carry bigints).
const jbig = (o) => (o == null ? "" : JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const ERC20 = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
];

const acct = mnemonicToAccount(SEED.trim(), { addressIndex: 0 });
const owner = acct.address;
const key = toHex(acct.getHdKey().privateKey);
const account = new Simple7702AccountV09(owner); // EntryPoint v0.9 (Candide's Arbitrum bundler rejects v0.8 7702)
const pub = createPublicClient({ transport: http(RPC) });

console.log("wallet (EOA == 7702 account):", owner);
console.log("ETH balance:", formatUnits(await pub.getBalance({ address: owner }), 18), "(gasless needs ZERO)");

// --- pick the action ---
let transfer;
if (POLICY) {
  console.log("mode: SPONSORED via policy", POLICY, "→ 0-value self-call, no funds needed");
  transfer = { to: owner, value: 0n, data: "0x" };
} else {
  const usdtBal = await pub.readContract({ address: USDT, abi: ERC20, functionName: "balanceOf", args: [owner] });
  console.log("mode: TOKEN (gas-in-USD₮) — USD₮ balance:", formatUnits(usdtBal, 6));
  const amountBase = BigInt(Math.round(AMOUNT * 1e6));
  if (usdtBal < amountBase) throw new Error(`wallet holds ${formatUnits(usdtBal, 6)} USD₮ — needs ≥ ${AMOUNT} (+ gas)`);
  const to = process.env.TO ?? owner;
  transfer = { to: USDT, value: 0n, data: encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [to, amountBase] }) };
}

// 1) Build the UserOp, attaching + signing the EIP-7702 delegation on the first op.
console.log("\n1) createUserOperation (+ 7702 delegation)…");
let userOp = await account.createUserOperation([transfer], RPC, EP, { eip7702Auth: { chainId: CHAIN_ID } });
if (userOp.eip7702Auth) {
  userOp.eip7702Auth = createAndSignEip7702DelegationAuthorization(
    BigInt(userOp.eip7702Auth.chainId), userOp.eip7702Auth.address, BigInt(userOp.eip7702Auth.nonce), key,
  );
  console.log("   7702 delegation signed → delegatee", userOp.eip7702Auth.address);
} else {
  console.log("   already delegated (no auth needed)");
}

// 2) Paymaster: sponsor (policy pays) or gas-in-USD₮.
console.log("2) paymaster…");
const paymaster = new CandidePaymaster(EP);
let op;
if (POLICY) {
  const r = await paymaster.createSponsorPaymasterUserOperation(account, userOp, EP, POLICY);
  op = r.userOperation;
  console.log("   sponsored ✓", jbig(r.sponsorMetadata));
} else {
  const r = await paymaster.createTokenPaymasterUserOperation(account, userOp, USDT, EP);
  op = r.userOperation;
  console.log("   USD₮ gas quote:", jbig(r.tokenQuote));
}

// 3) Sign locally (the key never leaves this machine).
console.log("3) signUserOperation (local)…");
op.signature = account.signUserOperation(op, key, CHAIN_ID);

// 4) Submit + wait for inclusion.
console.log("4) sendUserOperation → bundler…");
const resp = await account.sendUserOperation(op, EP);
console.log("   userOpHash:", resp.userOperationHash, "\n   waiting for inclusion…");
const result = await resp.included();
if (!result) throw new Error("not included");
console.log("\n✅ ON-CHAIN:", `${EXPLORER}/tx/${result.receipt.transactionHash}`);
console.log("   ETH after:", formatUnits(await pub.getBalance({ address: owner }), 18), "(unchanged ⇒ gas was not paid in ETH)");
