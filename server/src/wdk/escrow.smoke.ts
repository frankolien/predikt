/**
 * On-chain smoke for the USD₮ escrow — needs anvil running.
 *   npx tsx src/wdk/escrow.smoke.ts
 * Proves real USD₮ moves: fan → treasury (WDK) and treasury → fan (operator).
 */
import '../env.js';
import * as manager from '../pool/manager.js';
import * as escrow from './escrow.js';
import { tokenBalance } from './wallet.js';
import type { Address } from 'viem';

await manager.init();
const token = escrow.token();
const bal = async (a: string) => escrow.toHuman(await tokenBalance(a as Address, token));

const A = await manager.createWallet('Alice');
const B = await manager.createWallet('Bob');
console.log('backend:', manager.walletBackend(), '| treasury:', escrow.treasury().slice(0, 10));
console.log('A start:', await bal(A.address), '| B start:', await bal(B.address));

const depTx = await escrow.collect(A.address, escrow.toBase(5)); // A pays 5 USD₮ in
console.log('A → treasury 5 USD₮  tx:', depTx.slice(0, 14), '…');
const payTx = await escrow.pay(B.address, escrow.toBase(5)); // treasury pays B 5 USD₮
console.log('treasury → B 5 USD₮  tx:', payTx.slice(0, 14), '…');

const aEnd = Math.round(await bal(A.address));
const bEnd = Math.round(await bal(B.address));
console.log('A end:', aEnd, '| B end:', bEnd);

const ok = aEnd === 95 && bEnd === 105 && depTx.startsWith('0x') && payTx.startsWith('0x');
console.log(ok ? '\n✅ real USD₮ moved via WDK (deposit + payout)\n' : '\n❌ balances off\n');
process.exit(ok ? 0 : 1);
