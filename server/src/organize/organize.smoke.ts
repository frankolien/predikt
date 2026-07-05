/**
 * End-to-end smoke test for the Organize module — run with:
 *   DATABASE_URL=… npx tsx src/organize/organize.smoke.ts
 * Exercises paid settlement (pot conservation) and a bye bracket.
 */
import '../env.js';
import { initDb } from '../db/client.js';
import { createAccount, getAccount } from '../store/accounts.js';
import * as org from './store.js';

await initDb();

let failures = 0;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`, extra ?? '');
  if (!cond) failures++;
};
const sumPoints = async (ids: string[]) => {
  let sum = 0;
  for (const id of ids) sum += (await getAccount(id))!.points;
  return sum;
};

async function playOut(id: string, organizerId: string) {
  for (let guard = 0; guard < 40; guard++) {
    const t = (await org.getTournament(id))!;
    if (t.status !== 'live') return t;
    const ready = t.rounds
      .flatMap((r) => r.matches)
      .find((m) => m.status === 'ready' && m.home.participantId && m.away.participantId);
    if (!ready) {
      console.log('   …no ready match while still live (stuck bracket)');
      return t;
    }
    await org.reportMatch({ tournamentId: id, matchId: ready.id, organizerId, homeScore: 2, awayScore: 1 });
  }
  return (await org.getTournament(id))!;
}

// ---- A) paid 4-team cup: pot conservation ----
console.log('\n— paid 4-team cup —');
const players = await Promise.all(['ana', 'ben', 'cid', 'dee'].map((h) => createAccount(h)));
const playerIds = players.map((p) => p.account.id);
const org1 = players[0].account.id;
let t = await org.createTournament({ organizerId: org1, name: 'Smoke Cup', maxPlayers: 4, entryFee: 100, splitBps: [7000, 3000] });
for (const p of players) t = await org.joinTournament({ tournamentId: t.id, userId: p.account.id });
check('4 entrants joined', t.participantCount === 4, t.participantCount);
check('pot = 400', t.pot === 400, t.pot);
const afterJoin = await sumPoints(playerIds);
check('each debited 100 (sum = 3600)', afterJoin === 3600, afterJoin);

t = await org.startTournament({ tournamentId: t.id, organizerId: org1 });
check('bracket = 2 rounds', t.totalRounds === 2, t.rounds.map((r) => `${r.name}:${r.matches.length}`).join(', '));
t = await playOut(t.id, org1);
check('cup completed', t.status === 'completed', t.status);
check('has a champion', !!t.winnerId, t.participants.find((p) => p.id === t.winnerId)?.name);

const totalPoints = await sumPoints(playerIds);
check('points conserved (4×1000 = 4000)', totalPoints === 4000, totalPoints);
const champ = t.participants.find((p) => p.id === t.winnerId)!;
const runner = t.participants.find((p) => p.placement === 2)!;
check('champion paid 70% of 400 = 280', champ.payout === 280, champ.payout);
check('runner-up paid 30% of 400 = 120', runner.payout === 120, runner.payout);

// ---- B) free 3-team cup: byes ----
console.log('\n— free 3-team cup (byes) —');
const host = (await createAccount('host')).account.id;
let b = await org.createTournament({ organizerId: host, name: 'Bye Cup', maxPlayers: 4, entryFee: 0 });
b = await org.addEntrant({ tournamentId: b.id, organizerId: host, name: 'Brazil' });
b = await org.addEntrant({ tournamentId: b.id, organizerId: host, name: 'France' });
b = await org.addEntrant({ tournamentId: b.id, organizerId: host, name: 'Japan' });
check('3 entrants', b.participantCount === 3, b.participantCount);
b = await org.startTournament({ tournamentId: b.id, organizerId: host, seeding: 'join' });
const r1 = b.rounds[0].matches;
const byes = r1.filter((m) => m.status === 'confirmed').length;
check('exactly one first-round bye auto-resolved', byes === 1, `${byes} bye(s)`);
b = await playOut(b.id, host);
check('bye cup completed with a champion', b.status === 'completed' && !!b.winnerId, b.participants.find((p) => p.id === b.winnerId)?.name);

console.log(`\n${failures === 0 ? '🏆 all Organize checks passed' : `⚠️  ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
