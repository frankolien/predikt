/**
 * USD₮ cup end-to-end (real on-chain) — needs anvil + a Postgres.
 *   DATABASE_URL=… npx tsx src/organize/organize.usdt.smoke.ts
 * Links WDK wallets, joins a USD₮ cup (real deposits), settles (real payouts),
 * and checks balances, tx hashes, and conservation.
 */
import '../env.js';
import { initDb } from '../db/client.js';
import { createAccount } from '../store/accounts.js';
import { linkWallet, balanceOf, walletAddressOf } from '../store/wallets.js';
import * as manager from '../pool/manager.js';
import * as org from './store.js';

await initDb();
await manager.init();

let failures = 0;
const check = (l: string, c: boolean, e?: unknown) => {
  console.log(`${c ? '✅' : '❌'} ${l}`, e ?? '');
  if (!c) failures++;
};

const players = await Promise.all(['ana', 'ben', 'cid', 'dee'].map(async (h) => (await createAccount(h)).account.id));
for (const id of players) await linkWallet(id); // WDK wallet + 100 USD₮ each
const addrs = await Promise.all(players.map(async (id) => (await walletAddressOf(id))!));
const bals = async () => Promise.all(addrs.map((a) => balanceOf(a).then(Math.round)));
console.log('start balances:', await bals());

const creator = players[0];
let t = await org.createTournament({ organizerId: creator, name: 'USD₮ Cup', maxPlayers: 4, entryFee: 5, currency: 'usdt', splitBps: [10000] });
check('currency = usdt', t.currency === 'usdt', t.currency);
check('entry fee display = 5', t.entryFee === 5, t.entryFee);

for (const id of players) t = await org.joinTournament({ tournamentId: t.id, userId: id }); // real USD₮ deposits
check('4 joined', t.participantCount === 4, t.participantCount);
check('pot display = 20', t.pot === 20, t.pot);
check('all deposits have tx hashes', t.participants.every((p) => !!p.depositTx), t.participants.map((p) => p.depositTx?.slice(0, 8)));
check('each debited 5 USD₮ → 95', (await bals()).every((b) => b === 95), await bals());

t = await org.startTournament({ tournamentId: t.id, organizerId: creator });
async function playOut() {
  for (let g = 0; g < 40; g++) {
    const cur = (await org.getTournament(t.id))!;
    if (cur.status !== 'live') return cur;
    const rd = cur.rounds.flatMap((r) => r.matches).find((m) => m.status === 'ready' && m.home.participantId && m.away.participantId);
    if (!rd) return cur;
    await org.reportMatch({ tournamentId: t.id, matchId: rd.id, organizerId: creator, homeScore: 2, awayScore: 1 });
  }
  return (await org.getTournament(t.id))!;
}
t = await playOut();
check('completed', t.status === 'completed', t.status);

const champ = t.participants.find((p) => p.id === t.winnerId)!;
check('champion paid 20 USD₮', champ.payout === 20, champ.payout);
check('champion payout tx hash present', !!champ.payoutTx, champ.payoutTx?.slice(0, 12));
const end = await bals();
check('one champion at 115, three at 95', end.filter((b) => b === 115).length === 1 && end.filter((b) => b === 95).length === 3, end);
check('USD₮ conserved (sum = 400)', end.reduce((a, b) => a + b, 0) === 400, end.reduce((a, b) => a + b, 0));

console.log(`\n${failures === 0 ? '🏆 USD₮ cup end-to-end passed — real money in and out' : `⚠️  ${failures} failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
