/**
 * Deploy the test-USD₮ (MockUSDT) to the active network, signed by the operator
 * key, and seed the operator with a payout stash. Run ONCE per network; put the
 * printed address into GAFFER_USDT_ADDRESS.
 *
 *   GAFFER_NETWORK=arbitrum-sepolia \
 *   GAFFER_OPERATOR_KEY=0xYOUR_OPERATOR_PRIVATE_KEY \
 *   npx tsx scripts/deploy-token.ts
 *
 * Refuses to run on mainnet — there you use the REAL USD₮0 address, not a mock.
 */
import { config } from '../server/src/config.js';
import { operatorAccount, usdt } from '../server/src/chain/client.js';
import { deployMockUsdt, mintUsdt } from '../server/src/chain/ops.js';

if (config.network.kind === 'mainnet') {
  console.error(
    `✋ Refusing to deploy a MockUSDT on ${config.network.label}.\n` +
      `   On mainnet, set GAFFER_USDT_ADDRESS to the real USD₮0 token address instead.`,
  );
  process.exit(1);
}

console.log(`\nDeploying test-USD₮ on ${config.network.label} (chain ${config.chainId})`);
console.log(`Operator: ${operatorAccount.address}`);
console.log(`RPC:      ${config.rpcUrl}\n`);

const token = await deployMockUsdt();
console.log(`✅ Test-USD₮ (MockUSDT) deployed at:  ${token}`);

// Seed the operator with a big stash so treasury payouts have funds.
try {
  await mintUsdt(token, operatorAccount.address, usdt(1_000_000));
  console.log(`✅ Minted 1,000,000 test-USD₮ to the operator (payout treasury).`);
} catch (e) {
  console.warn(`⚠️  Could not pre-mint operator stash: ${(e as Error).message}`);
}

console.log(`\n👉 Add this to your environment (Railway → Variables):\n`);
console.log(`   GAFFER_USDT_ADDRESS=${token}\n`);
process.exit(0);
