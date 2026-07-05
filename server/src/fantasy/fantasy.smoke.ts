/**
 * Fantasy smoke test — run with:  npx tsx src/fantasy/fantasy.smoke.ts
 * Covers the FPL-style full squad: 15-man validation, auto-draft, auto-subs,
 * vice-captain fallback, Triple Captain / Bench Boost chips, and league
 * join/pay/settle with pot conservation.
 */
import '../env.js';
import { initDb } from '../db/client.js';
import { createAccount, getAccount } from '../store/accounts.js';
import * as fantasy from './store.js';
import { autoDraft, validateEntry } from './store.js';
import { scoreLineup, type LineupPlayer, type ScoreFixture } from './scoring.js';
import type { Position } from './players.js';

initDb();
let failures = 0;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`, extra ?? '');
  if (!cond) failures++;
};

// A) auto-draft yields a valid 15-man squad + 11-man XI + captain + vice, under budget
console.log('\n— auto-draft (full squad) —');
const d = autoDraft();
check('auto-draft has 15 squad players', d.squadIds.length === 15, d.squadIds.length);
check('auto-draft names 11 starters', d.starterIds.length === 11, d.starterIds.length);
check('captain and vice differ, both starters', d.captainId !== d.viceId && d.starterIds.includes(d.captainId) && d.starterIds.includes(d.viceId));
let budget = 0;
try {
  const { budgetUsed10, bench } = validateEntry({ squadIds: d.squadIds, starterIds: d.starterIds, captainId: d.captainId, viceId: d.viceId });
  budget = budgetUsed10 / 10;
  check('auto-draft passes validation', true);
  check('bench has 4 (1 GK + 3 outfield)', bench.length === 4 && bench.filter((p) => p.position === 'GK').length === 1);
} catch (e) {
  check('auto-draft passes validation', false, (e as Error).message);
}
check('auto-draft within budget', budget <= 100, `${budget.toFixed(1)}/100`);

// ---- synthetic lineup for the scoring engine ----
// Each team plays one finished home game vs "ZZ" (so it "featured"); a team with
// no fixture is a blank. Starter FWD 'M' blanks; bench FWD 'O' is first sub.
const win = (code: string): ScoreFixture => ({ home: { code }, away: { code: 'ZZ' }, result: { homeGoals: 2, awayGoals: 0 }, matchStatus: 'finished' });
const P = (id: string, position: Position, teamCode: string, starter: boolean, benchOrder = 0): LineupPlayer => ({ id, position, teamCode, starter, benchOrder });
const lineup: LineupPlayer[] = [
  P('gk1', 'GK', 'A', true), P('d1', 'DEF', 'C', true), P('d2', 'DEF', 'D', true), P('d3', 'DEF', 'E', true), P('d4', 'DEF', 'F', true),
  P('m1', 'MID', 'H', true), P('m2', 'MID', 'I', true), P('m3', 'MID', 'J', true), P('m4', 'MID', 'K', true),
  P('f1', 'FWD', 'M', true), P('f2', 'FWD', 'N', true), // f1 (team M) will blank
  P('gk2', 'GK', 'B', false, 0), P('d5', 'DEF', 'G', false, 2), P('m5', 'MID', 'L', false, 3), P('f3', 'FWD', 'O', false, 1),
];
// every team features except 'M'
const fixtures = ['A', 'C', 'D', 'E', 'F', 'H', 'I', 'J', 'K', 'N', 'B', 'G', 'L', 'O'].map(win);

console.log('\n— auto-substitution —');
const r1 = scoreLineup(lineup, 'f2', 'm1', null, fixtures);
check('blank starter f1 subbed OUT', r1.autoSubOut.includes('f1'), r1.autoSubOut);
check('bench f3 subbed IN', r1.autoSubIn.includes('f3'), r1.autoSubIn);
check('active XI = 11 with f3 not f1', r1.activeIds.length === 11 && r1.activeIds.includes('f3') && !r1.activeIds.includes('f1'));

console.log('\n— vice-captain fallback —');
const r2 = scoreLineup(lineup, 'f1', 'f2', null, fixtures); // captain f1 blanks
check('armband passes to vice f2', r2.captainedId === 'f2', r2.captainedId);
check('vice f2 counted double', r2.perPlayer['f2'] === r2.basePerPlayer['f2'] * 2, `${r2.perPlayer['f2']} vs base ${r2.basePerPlayer['f2']}`);

console.log('\n— Triple Captain —');
const r3 = scoreLineup(lineup, 'f2', 'm1', 'tc', fixtures);
check('captain f2 counted ×3', r3.perPlayer['f2'] === r3.basePerPlayer['f2'] * 3, `${r3.perPlayer['f2']} vs base ${r3.basePerPlayer['f2']}`);

console.log('\n— Bench Boost —');
const r4 = scoreLineup(lineup, 'f2', 'm1', 'bb', fixtures);
check('bench boost counts all 15', r4.activeIds.length === 15, r4.activeIds.length);
const benchBase = ['gk2', 'd5', 'm5', 'f3'].reduce((a, id) => a + r4.basePerPlayer[id], 0);
check('bench players contribute (>0)', benchBase > 0, benchBase);

// B) league: 3 managers autodraft-join & pay, settle winner-take-all, pot conserved
console.log('\n— league (buy-in + settle) —');
const mgrs = ['ana', 'ben', 'cid'].map((h) => createAccount(h));
const creator = mgrs[0].account.id;
let lg = fantasy.createLeague({ creatorId: creator, name: 'Smoke League', buyIn: 100, splitBps: [10000] });
for (const m of mgrs) {
  const draft = autoDraft();
  lg = fantasy.joinLeague({ leagueId: lg.id, userId: m.account.id, squadIds: draft.squadIds, starterIds: draft.starterIds, captainId: draft.captainId, viceId: draft.viceId });
}
check('3 managers joined', lg.memberCount === 3, lg.memberCount);
check('pot = 300', lg.pot === 300, lg.pot);
check('each squad stores 15 players', lg.standings.every((s) => s.players.length === 15), lg.standings.map((s) => s.players.length).join(','));
check('each squad has a formation + vice', lg.standings.every((s) => !!s.formation && !!s.viceCaptainId));
const afterJoin = mgrs.reduce((a, m) => a + getAccount(m.account.id)!.points, 0);
check('each debited 100 (sum = 2700)', afterJoin === 2700, afterJoin);

lg = fantasy.startLeague({ leagueId: lg.id, creatorId: creator });
lg = fantasy.settleLeague({ leagueId: lg.id, creatorId: creator });
check('league settled', lg.status === 'settled', lg.status);
const totalPoints = mgrs.reduce((a, m) => a + getAccount(m.account.id)!.points, 0);
check('points conserved (3×1000 = 3000)', totalPoints === 3000, totalPoints);
const winner = lg.standings.find((s) => s.placement === 1)!;
check('winner paid the whole pot (300)', winner.payout === 300, `${winner.handle} +${winner.payout}`);

console.log(`\n${failures === 0 ? '🏆 all Fantasy checks passed' : `⚠️  ${failures} failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
