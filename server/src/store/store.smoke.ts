/**
 * Proves the free-to-play points economy end-to-end, no chain, no HTTP:
 *   accounts (signup bonus) → create pool → join with predictions → settle → payouts.
 * Run: rm -f gaffer.db* && npx tsx src/store/store.smoke.ts
 */
import '../env.js';
import { initDb } from '../db/client.js';
import { initFootball, getFixtures, getMarqueeFixtureId, getFixture, getTeam, stopFootball } from '../football/index.js';
import { createAccount, getAccount, leaderboard } from './accounts.js';
import { createPool, joinPool, settlePool, getPool } from './pools.js';

initDb();
await initFootball();

const fixtureId = getMarqueeFixtureId() || getFixtures()[0]?.id;
if (!fixtureId) throw new Error('no fixture available');
const fx = getFixture(fixtureId)!;
const bal = (id: string) => getAccount(id)!.points;

console.log('');
console.log('==================== POINTS ECONOMY SMOKE ====================');
console.log(`fixture: ${getTeam(fx.homeTeamId).name} v ${getTeam(fx.awayTeamId).name}  (${fixtureId})`);

const alice = createAccount('Alice').account;
const bob = createAccount('Bob').account;
const cara = createAccount('Cara').account;
console.log(`signup bonus → Alice=${alice.points} Bob=${bob.points} Cara=${cara.points}`);

const pool = createPool({ creatorId: alice.id, fixtureId, name: 'Mates league', buyIn: 100, isPublic: true });
console.log(`\npool ${pool.code} "${pool.name}" · buy-in ${pool.buyIn} pts`);

joinPool({ poolId: pool.id, userId: alice.id, predHome: 2, predAway: 1 }); // home win
joinPool({ code: pool.code, userId: bob.id, predHome: 0, predAway: 0 }); // draw
joinPool({ code: pool.code, userId: cara.id, predHome: 1, predAway: 3 }); // away win

let view = getPool(pool.id)!;
console.log(`pot ${view.potPoints} pts · ${view.memberCount} in`);
for (const m of view.members) console.log(`  ${m.handle.padEnd(6)} ${m.prediction.homeGoals}:${m.prediction.awayGoals}  staked ${m.staked}`);
console.log(`balances after join → Alice=${bal(alice.id)} Bob=${bal(bob.id)} Cara=${bal(cara.id)}`);

// Settle on a home win (2-0) — only Alice called the home outcome.
view = settlePool(pool.id, { homeGoals: 2, awayGoals: 0 });
console.log(`\nsettled ${view.result!.homeGoals}-${view.result!.awayGoals}`);
for (const m of view.members) {
  console.log(`  ${m.handle.padEnd(6)} ${m.won ? `WON +${m.winnings}` : 'lost'}${m.exact ? ' (exact score!)' : ''}`);
}
console.log(`balances after settle → Alice=${bal(alice.id)} Bob=${bal(bob.id)} Cara=${bal(cara.id)}`);
console.log(`\nleaderboard: ${leaderboard(5).map((u) => `${u.handle}=${u.points}`).join(', ')}`);

const potConserved = bal(alice.id) + bal(bob.id) + bal(cara.id) === 3000;
console.log(`\npoints conserved (3×1000): ${potConserved ? '✅' : '❌'}`);
console.log('=============================================================');

stopFootball();
await new Promise((r) => setTimeout(r, 200));
process.exit(0);
