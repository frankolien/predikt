/**
 * Mint test-USD₮ to any address on the active (non-mainnet) network, signed by
 * the operator. Handy for topping up a tester's wallet or your own demo wallet.
 *
 *   GAFFER_NETWORK=arbitrum-sepolia \
 *   GAFFER_USDT_ADDRESS=0x… \
 *   GAFFER_OPERATOR_KEY=0x… \
 *   npx tsx scripts/mint-usdt.ts <toAddress> [amount=1000]
 *
 * Refuses mainnet — the real USD₮0 token has no open mint.
 */
import { isAddress, type Address } from 'viem';
import { config } from '../server/src/config.js';
import { usdt } from '../server/src/chain/client.js';
import { mintUsdt } from '../server/src/chain/ops.js';
import { tokenBalance } from '../server/src/wdk/wallet.js';

const to = process.argv[2] as Address | undefined;
const amount = Number(process.argv[3] ?? 1000);

if (!to || !isAddress(to)) {
  console.error('Usage: npx tsx scripts/mint-usdt.ts <toAddress> [amount]');
  process.exit(1);
}
if (config.network.kind === 'mainnet') {
  console.error(`✋ Refusing to mint on ${config.network.label} — real USD₮0 has no open mint.`);
  process.exit(1);
}
if (!config.usdtAddress) {
  console.error('GAFFER_USDT_ADDRESS is not set — deploy the token first (scripts/deploy-token.ts).');
  process.exit(1);
}

const token = config.usdtAddress as Address;
console.log(`\nMinting ${amount.toLocaleString()} test-USD₮ on ${config.network.label}`);
console.log(`Token: ${token}`);
console.log(`To:    ${to}\n`);

const hash = await mintUsdt(token, to, usdt(amount));
const bal = await tokenBalance(to, token);
console.log(`✅ Minted. tx: ${hash}`);
console.log(`   ${to} now holds ${(Number(bal) / 10 ** config.usdtDecimals).toLocaleString()} test-USD₮`);
if (config.network.explorer) {
  console.log(`   tx:     ${config.network.explorer}/tx/${hash}`);
  console.log(`   wallet: ${config.network.explorer}/address/${to}`);
}
