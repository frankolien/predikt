/**
 * Pool manager — the stateful brain of Gaffer.
 *
 * Ties the football fixtures to on-chain escrow pools and self-custodial WDK
 * wallets: deploys the demo USDt, deploys a PredictionPool per fixture, creates
 * fan wallets (funding gas + minting demo USDt in local mode), records deposits,
 * and settles pools via the operator/oracle. All money is held by the pool
 * contract; the manager only orchestrates.
 */
import { parseEventLogs, stringToHex, type Address, type Hex } from 'viem';
import { config } from '../config.js';
import { operatorAccount, publicClient, usdt, fromUsdt } from '../chain/client.js';
import * as artifacts from '../chain/artifacts.js';
import { deployMockUsdt, deployPool, fundGas, mintUsdt, settlePoolOnChain } from '../chain/ops.js';
import * as wallet from '../wdk/wallet.js';
import {
  initFootball,
  getFixtures,
  getFixture,
  getTeam,
  getMarqueeFixtureId,
  onFixturesChanged,
} from '../football/index.js';
import type { Prediction } from '../types.js';

const DEFAULT_STAKE = Number(process.env.GAFFER_STAKE || 5); // USDt buy-in per fan
const STARTING_BALANCE = Number(process.env.GAFFER_START_BALANCE || 100); // demo USDt minted per wallet

interface EntryState {
  address: Address;
  displayName: string;
  prediction: Prediction;
  stakeHuman: number;
  approveTx: Hex;
  depositTx: Hex;
  isBot: boolean;
  won?: boolean;
  winningsHuman?: number;
  exactScore?: boolean;
}

interface PoolState {
  fixtureId: string;
  escrow: Address;
  stakeBase: bigint;
  stakeHuman: number;
  lockTime: bigint;
  status: 'open' | 'settled';
  entries: EntryState[];
  result?: Prediction;
  settleTx?: Hex;
}

let usdtAddress: Address;
const pools = new Map<string, PoolState>();
let ready = false;

/**
 * Demo live-match simulation. Real matches go live at their real kickoff; this
 * lets us drive the live in-play experience on demand for a demo. It overrides
 * the fixture's live score/minute/status in `fixtureSummary` until cleared.
 */
interface LiveSim {
  minute: number | string;
  home: number;
  away: number;
  status: 'live' | 'finished';
}
const liveSim = new Map<string, LiveSim>();

/**
 * Real-time change emitter. Both the live football feed (via `onFixturesChanged`,
 * wired in `init`) and the demo simulation funnel their changed-fixture ids here,
 * so the API's SSE `/api/stream` can push updates to the browser the instant they
 * happen instead of clients polling.
 */
type LiveListener = (ids: string[]) => void;
const liveListeners = new Set<LiveListener>();
export function onLiveChange(cb: LiveListener): () => void {
  liveListeners.add(cb);
  return () => liveListeners.delete(cb);
}
function emitLive(ids: string[]): void {
  if (ids.length === 0) return;
  for (const cb of liveListeners) {
    try {
      cb(ids);
    } catch {
      /* a bad listener must not break the caller */
    }
  }
}

export function simulateLive(fixtureId: string, s: LiveSim) {
  liveSim.set(fixtureId, s);
  emitLive([fixtureId]);
}
export function clearLive(fixtureId: string) {
  liveSim.delete(fixtureId);
  emitLive([fixtureId]);
}
/** Current best-known score + live state for a fixture (real feed or simulation). */
export function liveState(fixtureId: string): { homeGoals: number; awayGoals: number; minute: number | string | null; matchStatus: string } | null {
  const s = fixtureSummary(fixtureId);
  if (!s) return null;
  return {
    homeGoals: s.result?.homeGoals ?? 0,
    awayGoals: s.result?.awayGoals ?? 0,
    minute: s.minute,
    matchStatus: s.matchStatus,
  };
}

export function isReady() {
  return ready;
}
export function usdtToken(): Address {
  return usdtAddress;
}
export function operatorAddress(): Address {
  return operatorAccount.address;
}
export function walletBackend() {
  return wallet.currentBackend();
}

/** Deploy demo USDt (local), then seed the marquee pool with bot fans. */
export async function init(): Promise<void> {
  // Load REAL, live football fixtures (with offline fallback) before pools exist.
  await initFootball();
  // Re-broadcast real-feed changes to SSE subscribers (live scores/status/minute).
  onFixturesChanged((ids) => emitLive(ids));

  if (config.usdtAddress) {
    // Testnet/mainnet: use the configured token (our deployed test-USD₮, or real USD₮0).
    usdtAddress = config.usdtAddress;
    console.log(`[pool] using USD₮ at ${usdtAddress} on ${config.network.label}`);
  } else if (config.network.kind === 'local') {
    // Local demo: deploy a fresh MockUSDT each boot (ephemeral chain).
    usdtAddress = await deployMockUsdt();
    console.log(`[pool] MockUSDT deployed at ${usdtAddress}`);
  } else {
    throw new Error(`GAFFER_USDT_ADDRESS required on ${config.network.label}`);
  }

  // Seed the soonest real fixture so the demo has a live pool with winners & losers.
  const marquee = getMarqueeFixtureId();
  if (!marquee) {
    console.warn('[pool] no fixtures available to seed a marquee pool');
    ready = true;
    return;
  }
  try {
    await getOrCreatePool(marquee, DEFAULT_STAKE);
    await seedBots(marquee);
    ready = true;
    const fx = getFixture(marquee);
    const label = fx ? `${getTeam(fx.homeTeamId).name} vs ${getTeam(fx.awayTeamId).name}` : marquee;
    console.log(`[pool] marquee pool seeded with bot fans ✅ (${marquee}: ${label})`);
  } catch (err) {
    console.warn(`[pool] bot seeding skipped: ${(err as Error).message}`);
    ready = true;
  }
}

export async function getOrCreatePool(fixtureId: string, stakeHuman = DEFAULT_STAKE): Promise<PoolState> {
  const existing = pools.get(fixtureId);
  if (existing) return existing;

  const fixture = getFixture(fixtureId);
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureId}`);

  const lockTime = BigInt(Math.floor(Date.parse(fixture.kickoff) / 1000));
  const refundDeadline = lockTime + 7n * 86400n;
  const stakeBase = usdt(stakeHuman);
  const escrow = await deployPool({
    token: usdtAddress,
    settler: operatorAccount.address,
    stake: stakeBase,
    lockTime,
    refundDeadline,
    fixtureId: stringToHex(fixtureId, { size: 32 }),
  });

  const pool: PoolState = {
    fixtureId,
    escrow,
    stakeBase,
    stakeHuman,
    lockTime,
    status: 'open',
    entries: [],
  };
  pools.set(fixtureId, pool);
  console.log(`[pool] ${fixtureId} escrow deployed at ${escrow} (stake ${stakeHuman} USDT)`);
  return pool;
}

/**
 * Fund a fresh wallet's gas + mint its demo USD₮. Runs on **faucet networks**
 * (local + testnet) and is a no-op on mainnet — real money is never minted.
 */
export async function fundWallet(address: Address): Promise<void> {
  if (!config.network.faucet) return;
  await fundGas(address, config.network.gasDrip);
  await mintUsdt(usdtAddress, address, usdt(STARTING_BALANCE));
}

/**
 * Faucet networks only: if a returning wallet has been drained to empty — e.g.
 * the local demo chain reset on redeploy — refill it to the starting balance so
 * testers are never stranded at 0. No-op on mainnet.
 */
export async function topUpIfLow(address: Address): Promise<void> {
  if (!config.network.faucet) return;
  try {
    if ((await walletBalance(address)) > 0) return;
    await fundGas(address, config.network.gasDrip).catch(() => {});
    await mintUsdt(usdtAddress, address, usdt(STARTING_BALANCE));
  } catch (e) {
    console.warn(`[pool] topUpIfLow ${address} failed:`, (e as Error).message);
  }
}

/** USDt balance of an address (human units); 0 if the read fails. */
export async function walletBalance(address: Address): Promise<number> {
  try {
    return fromUsdt(await wallet.tokenBalance(address, usdtAddress));
  } catch {
    return 0;
  }
}

/** Create a self-custodial fan wallet, fund gas + mint demo USDt (local). */
export async function createWallet(displayName: string): Promise<{
  address: Address;
  displayName: string;
  mnemonic: string;
  backend: string;
  usdtHuman: number;
}> {
  const fan = await wallet.createFan(displayName);
  await fundWallet(fan.address);
  const bal = await wallet.tokenBalance(fan.address, usdtAddress);
  return {
    address: fan.address,
    displayName: fan.displayName,
    mnemonic: fan.mnemonic,
    backend: fan.backend,
    usdtHuman: fromUsdt(bal),
  };
}

/** Re-register a wallet from an existing recovery phrase (returning user). */
export async function importWallet(mnemonic: string, displayName: string): Promise<{
  address: Address;
  displayName: string;
  backend: string;
  usdtHuman: number;
}> {
  const fan = await wallet.importFan(mnemonic, displayName);
  return {
    address: fan.address,
    displayName: fan.displayName,
    backend: fan.backend,
    usdtHuman: await walletBalance(fan.address),
  };
}

export interface JoinInput {
  fixtureId: string;
  address: Address;
  prediction: Prediction;
  displayName?: string;
  isBot?: boolean;
}

export async function joinPool(input: JoinInput): Promise<PoolState> {
  const pool = await getOrCreatePool(input.fixtureId);
  if (pool.status !== 'open') throw new Error('Pool is already settled');
  if (pool.entries.some((e) => e.address.toLowerCase() === input.address.toLowerCase())) {
    throw new Error('This wallet has already joined the pool');
  }

  const res = await wallet.joinPool({
    address: input.address,
    pool: pool.escrow,
    token: usdtAddress,
    stake: pool.stakeBase,
    homeGoals: input.prediction.homeGoals,
    awayGoals: input.prediction.awayGoals,
  });

  const fan = wallet.getFan(input.address);
  pool.entries.push({
    address: input.address,
    displayName: input.displayName ?? fan?.displayName ?? shortAddr(input.address),
    prediction: input.prediction,
    stakeHuman: pool.stakeHuman,
    approveTx: res.approveTx,
    depositTx: res.depositTx,
    isBot: input.isBot ?? false,
  });
  return pool;
}

/** Oracle posts the score; contract distributes; we read the Payout events back. */
export async function settle(fixtureId: string, result: Prediction): Promise<PoolState> {
  const pool = pools.get(fixtureId);
  if (!pool) throw new Error(`No pool for fixture ${fixtureId}`);
  if (pool.status === 'settled') throw new Error('Pool already settled');

  const hash = await settlePoolOnChain(pool.escrow, result.homeGoals, result.awayGoals);
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const payouts = parseEventLogs({
    abi: artifacts.PredictionPool.abi,
    eventName: 'Payout',
    logs: receipt.logs,
  }) as Array<{ args: { player: Address; amount: bigint; won: boolean; exactScore: boolean } }>;

  const byAddr = new Map<string, { amount: bigint; won: boolean; exactScore: boolean }>();
  for (const p of payouts) byAddr.set(p.args.player.toLowerCase(), p.args);

  for (const e of pool.entries) {
    const p = byAddr.get(e.address.toLowerCase());
    e.won = p?.won ?? false;
    e.winningsHuman = p ? fromUsdt(p.amount) : 0;
    e.exactScore = p?.exactScore ?? false;
  }
  pool.status = 'settled';
  pool.result = result;
  pool.settleTx = hash;
  const fx = getFixture(fixtureId)!;
  fx.status = 'settled';
  fx.result = { homeGoals: result.homeGoals, awayGoals: result.awayGoals };
  console.log(`[pool] ${fixtureId} settled ${result.homeGoals}-${result.awayGoals} (tx ${hash})`);
  emitLive([fixtureId]);
  return pool;
}

// ---- views for the API ----

export async function poolView(fixtureId: string) {
  const pool = pools.get(fixtureId);
  if (!pool) return null;
  const fixture = getFixture(fixtureId)!;
  const potBase = await publicClient
    .readContract({ address: pool.escrow, abi: artifacts.PredictionPool.abi, functionName: 'pot' })
    .catch(() => 0n);
  return {
    fixtureId,
    escrow: pool.escrow,
    stake: pool.stakeHuman,
    status: pool.status,
    potHuman: fromUsdt(potBase as bigint),
    playerCount: pool.entries.length,
    result: pool.result ?? null,
    settleTx: pool.settleTx ?? null,
    fixture: fixtureSummary(fixtureId),
    entries: pool.entries.map((e) => ({
      address: e.address,
      displayName: e.displayName,
      prediction: e.prediction,
      stake: e.stakeHuman,
      isBot: e.isBot,
      approveTx: e.approveTx,
      depositTx: e.depositTx,
      won: e.won ?? null,
      winnings: e.winningsHuman ?? null,
      exactScore: e.exactScore ?? false,
    })),
  };
}

export function fixtureSummary(fixtureId: string) {
  const f = getFixture(fixtureId);
  if (!f) return null;
  const home = getTeam(f.homeTeamId);
  const away = getTeam(f.awayTeamId);
  const pool = pools.get(fixtureId);
  // Live match state from the real-data layer (distinct from pool lifecycle `status`).
  let matchStatus: 'scheduled' | 'live' | 'finished' =
    f.matchStatus ?? (f.status === 'settled' ? 'finished' : 'scheduled');
  let result = f.result ?? null;
  let minute: number | string | null = matchStatus === 'live' ? f.minute ?? null : null;

  // Demo simulation override (until the pool is settled on-chain).
  const sim = liveSim.get(fixtureId);
  if (sim && f.status !== 'settled') {
    matchStatus = sim.status;
    result = { homeGoals: sim.home, awayGoals: sim.away };
    minute = sim.status === 'live' ? sim.minute : null;
  }
  const isLive = matchStatus === 'live';
  return {
    id: f.id,
    stage: f.stage,
    kickoff: f.kickoff,
    venue: f.venue,
    status: f.status,
    // `result` reflects the CURRENT score (live or final); null before kickoff.
    result,
    // --- live fields (additive) ---
    matchStatus,
    minute,
    isLive,
    league: f.league ?? null,
    home: teamCard(home),
    away: teamCard(away),
    poolExists: !!pool,
    stake: pool?.stakeHuman ?? DEFAULT_STAKE,
    playerCount: pool?.entries.length ?? 0,
  };
}

export function allFixtures() {
  return getFixtures().map((f) => fixtureSummary(f.id));
}

function teamCard(t: ReturnType<typeof getTeam>) {
  return {
    id: t.id,
    name: t.name,
    code: t.code,
    flag: t.flag,
    fifaRank: t.fifaRank,
    form: t.recentForm,
    keyPlayer: t.keyPlayer,
    // additive: real crest URL (consumed by the web Scorebug) + country
    crest: t.badge ?? null,
    country: t.country ?? null,
  };
}

async function seedBots(fixtureId: string): Promise<void> {
  // Three bot fans with divergent predictions so any result yields winners+losers.
  const bots: Array<{ name: string; prediction: Prediction }> = [
    { name: 'Diego', prediction: { homeGoals: 2, awayGoals: 1 } },
    { name: 'Chloe', prediction: { homeGoals: 1, awayGoals: 2 } },
    { name: 'Sam', prediction: { homeGoals: 1, awayGoals: 1 } },
  ];
  for (const bot of bots) {
    const w = await createWallet(bot.name);
    await joinPool({
      fixtureId,
      address: w.address,
      prediction: bot.prediction,
      displayName: bot.name,
      isBot: true,
    });
  }
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
