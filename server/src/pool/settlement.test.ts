/**
 * Pure settlement tests. Run: npm -w server test
 * No chain, no SDKs — just the money math.
 */
import assert from "node:assert/strict";
import { settlePool } from "./settlement.js";
import type { PoolEntry } from "../types.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const entry = (address: string, hg: number, ag: number, stake = 5): PoolEntry => ({
  address,
  displayName: address,
  prediction: { homeGoals: hg, awayGoals: ag },
  stake,
  joinedAt: "2026-07-04T00:00:00Z",
});

console.log("settlement");

test("splits the whole pot among correct-outcome callers, conserving it exactly", () => {
  const entries = [
    entry("0xHomeA", 2, 1), // home win  ✓
    entry("0xHomeB", 3, 0), // home win  ✓
    entry("0xAway", 0, 1), //  away win  ✗
  ];
  const s = settlePool(entries, { homeGoals: 2, awayGoals: 0 }); // home win
  const total = s.payouts.reduce((a, p) => a + p.baseUnits, 0n);
  assert.equal(total, s.potBaseUnits, "pot conserved");
  assert.equal(s.potBaseUnits, 15_000000n);
  const winners = s.payouts.filter((p) => p.won);
  assert.equal(winners.length, 2);
  assert.equal(winners[0].baseUnits, 7_500000n); // 15 / 2
  assert.equal(s.payouts.find((p) => p.address === "0xAway")!.baseUnits, 0n);
});

test("refunds everyone when nobody calls the outcome", () => {
  const entries = [entry("0xA", 1, 0), entry("0xB", 2, 1)]; // both home
  const s = settlePool(entries, { homeGoals: 0, awayGoals: 2 }); // away win
  assert.equal(s.refunded, true);
  for (const p of s.payouts) assert.equal(p.baseUnits, 5_000000n);
});

test("flags exact scoreline", () => {
  const entries = [entry("0xExact", 2, 1), entry("0xOutcomeOnly", 3, 1)];
  const s = settlePool(entries, { homeGoals: 2, awayGoals: 1 });
  assert.equal(s.payouts.find((p) => p.address === "0xExact")!.exactScore, true);
  assert.equal(s.payouts.find((p) => p.address === "0xOutcomeOnly")!.exactScore, false);
});

test("pro-rata by stake, dust to the largest winner, pot exact", () => {
  const entries = [entry("0xBig", 1, 0, 7), entry("0xSmall", 3, 2, 3), entry("0xLose", 0, 1, 5)];
  const s = settlePool(entries, { homeGoals: 1, awayGoals: 0 }); // home win; 0xLose is away
  const total = s.payouts.reduce((a, p) => a + p.baseUnits, 0n);
  assert.equal(total, s.potBaseUnits, "pot conserved with dust");
  assert.equal(s.potBaseUnits, 15_000000n);
  // winners share 15 pro-rata to 7:3 → 10.5 and 4.5
  assert.equal(s.payouts.find((p) => p.address === "0xBig")!.baseUnits, 10_500000n);
  assert.equal(s.payouts.find((p) => p.address === "0xSmall")!.baseUnits, 4_500000n);
});

console.log(`\n${passed} passed\n`);
