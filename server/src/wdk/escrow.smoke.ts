/**
 * On-chain smoke for the USD₮ escrow payout leg — needs anvil running.
 *   npx tsx src/wdk/escrow.smoke.ts
 * Proves real USD₮ moves treasury → winner (operator-signed).
 *
 * NOTE: the DEPOSIT leg (fan → treasury) is now signed by the FAN client-side and
 * verified on-chain by `escrow.verifyDeposit` (client-side custody) — it's exercised
 * by the M1/M2 client-simulation e2e, not here.
 */
import '../env.js';
import * as manager from '../pool/manager.js';
import * as escrow from './escrow.js';
import { tokenBalance } from './wallet.js';
import type { Address } from 'viem';

await manager.init();
const token = escrow.token();
const bal = async (a: string) => escrow.toHuman(await tokenBalance(a as Address, token));

const B = await manager.createWallet('Bob');
const bStart = Math.round(await bal(B.address));
console.log('backend:', manager.walletBackend(), '| treasury:', escrow.treasury().slice(0, 10));
console.log('B start:', bStart);

const payTx = await escrow.pay(B.address, escrow.toBase(5)); // treasury → winner (operator-signed)
console.log('treasury → B 5 USD₮  tx:', payTx.slice(0, 14), '…');

const bEnd = Math.round(await bal(B.address));
console.log('B end:', bEnd);

const ok = bEnd === bStart + 5 && payTx.startsWith('0x');
console.log(ok ? '\n✅ real USD₮ payout via operator\n' : '\n❌ balances off\n');
process.exit(ok ? 0 : 1);
