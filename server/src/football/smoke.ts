/**
 * Standalone proof that REAL, LIVE football data loads.
 * Run: node_modules/.bin/tsx server/src/football/smoke.ts
 *
 * Calls initFootball() (which hits the live API) then prints every fixture with
 * its teams, kickoff, live match status and current score. No chain, no server.
 */
import {
  initFootball,
  getFixtures,
  getTeam,
  getMarqueeFixtureId,
  footballStatus,
  formString,
  stopFootball,
} from './index.js';

const t0 = Date.now();
await initFootball();

const status = footballStatus();
console.log('');
console.log('==================== FOOTBALL SNAPSHOT ====================');
console.log(`mode        : ${status.mode}`);
console.log(`provider    : ${status.provider}`);
console.log(`competition : ${status.competition}`);
console.log(`fixtures    : ${status.fixtures}   teams: ${status.teams}   live now: ${status.live}`);
console.log(`fetched in  : ${Date.now() - t0}ms`);
console.log('==========================================================');
console.log('');

const fixtures = getFixtures();
console.log(`ID        STATUS     STAGE           KICKOFF (UTC)          MATCH                               SCORE  MIN`);
console.log('-'.repeat(118));
for (const f of fixtures) {
  const home = getTeam(f.homeTeamId);
  const away = getTeam(f.awayTeamId);
  const match = `${home.flag} ${home.name} vs ${away.name} ${away.flag}`;
  const score = f.result ? `${f.result.homeGoals}-${f.result.awayGoals}` : '—';
  const min = f.matchStatus === 'live' ? String(f.minute ?? '') : '';
  console.log(
    `${f.id.padEnd(9)} ${(f.matchStatus ?? '').padEnd(10)} ${f.stage.padEnd(15)} ${f.kickoff.padEnd(22)} ${match.padEnd(40)} ${score.padStart(5)}  ${min}`,
  );
}

console.log('');
const marquee = getMarqueeFixtureId();
const mf = fixtures.find((f) => f.id === marquee);
if (mf) {
  const h = getTeam(mf.homeTeamId);
  const a = getTeam(mf.awayTeamId);
  console.log(`Marquee fixture (default pool): ${marquee} → ${h.name} vs ${a.name} (${mf.stage}, ${mf.kickoff})`);
  console.log(`  ${h.name} form ${formString(h.recentForm) || '(none)'} | key: ${h.keyPlayer}`);
  console.log(`    style: ${h.styleNote}`);
  console.log(`  ${a.name} form ${formString(a.recentForm) || '(none)'} | key: ${a.keyPlayer}`);
  console.log(`    style: ${a.styleNote}`);
}

stopFootball();
process.exit(0);
