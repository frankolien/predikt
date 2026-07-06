/**
 * HTTP API (Fastify) — localhost only. Exposes wallets, pools, settlement, and
 * the on-device Gaffer as a Server-Sent Events stream.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Address } from 'viem';
import { config } from '../config.js';
import * as manager from '../pool/manager.js';
import { streamGafferRead, streamLiveReaction, streamAsk } from '../qvac/service.js';
import { status as aiStatus, ensureLoaded } from '../qvac/engine.js';
import * as voice from '../qvac/voice.js';
import * as accounts from '../store/accounts.js';
import * as walletAuth from '../store/walletAuth.js';
import * as store from '../store/pools.js';
import * as wallets from '../store/wallets.js';
import * as organize from '../organize/store.js';
import { streamDirector, type DirectorKind } from '../organize/ai.js';
import * as fantasy from '../fantasy/store.js';
import { streamFantasyAI, type FantasyAiKind } from '../fantasy/ai.js';

export function buildApp() {
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
  app.register(cors, { origin: true });

  // Raw audio body (for /api/voice/transcribe).
  app.addContentTypeParser(
    ['audio/wav', 'audio/x-wav', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  // ---- free-to-play accounts + points pools ----

  const authed = (req: { headers: Record<string, unknown> }) => {
    const h = req.headers['authorization'];
    const bearer = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : undefined;
    const token = bearer ?? (req.headers['x-gaffer-token'] as string | undefined);
    return accounts.accountFromToken(token);
  };

  app.post('/api/account', async (req) => {
    const { handle } = (req.body ?? {}) as { handle?: string };
    return accounts.createAccount(handle || 'Anon'); // { account, token }
  });

  // ---- wallet-as-identity auth (self-custodial) ----
  // Your WDK recovery phrase IS your login: it derives your wallet address, and
  // the account is keyed to it — so the same phrase recovers you on any device.

  // Create a brand-new wallet + account. Recovery phrase returned ONCE.
  app.post('/api/auth/wallet/new', async (req, reply) => {
    const { handle } = (req.body ?? {}) as { handle?: string };
    try {
      return await walletAuth.createWalletAccount(handle);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // Sign in / recover from a recovery phrase.
  app.post('/api/auth/wallet/restore', async (req, reply) => {
    const { mnemonic, handle } = (req.body ?? {}) as { mnemonic?: string; handle?: string };
    if (!mnemonic || !mnemonic.trim()) return reply.code(400).send({ error: 'recovery phrase required' });
    try {
      return await walletAuth.signInWithMnemonic(mnemonic, handle);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/account', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'not signed in' });
    return { account: a };
  });

  app.get('/api/leaderboard', async () => ({ leaderboard: await accounts.leaderboard(20) }));

  // Link a self-custodial USD₮ wallet (WDK) to the signed-in account.
  app.post('/api/account/wallet', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    try {
      return await wallets.linkWallet(a.id);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.get('/api/account/wallet', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    return (await wallets.getWallet(a.id)) ?? { address: null, usdtHuman: 0 };
  });

  app.post('/api/pools', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const b = (req.body ?? {}) as { fixtureId?: string; name?: string; buyIn?: number; isPublic?: boolean; currency?: 'points' | 'usdt' };
    if (!b.fixtureId) return reply.code(400).send({ error: 'fixtureId required' });
    try {
      return store.createPool({
        creatorId: a.id,
        fixtureId: b.fixtureId,
        name: b.name,
        buyIn: b.buyIn,
        isPublic: b.isPublic,
        currency: b.currency,
      });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/pools/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await store.getPool(id);
    if (!p) return reply.code(404).send({ error: 'pool not found' });
    return p;
  });

  app.get('/api/pools/code/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const p = await store.getPoolByCode(code);
    if (!p) return reply.code(404).send({ error: 'no pool with that code' });
    return p;
  });

  app.post('/api/pools/join', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const b = (req.body ?? {}) as {
      poolId?: string;
      code?: string;
      prediction?: { homeGoals?: number; awayGoals?: number };
    };
    try {
      const pool = await store.joinPool({
        poolId: b.poolId,
        code: b.code,
        userId: a.id,
        predHome: b.prediction?.homeGoals ?? 0,
        predAway: b.prediction?.awayGoals ?? 0,
      });
      return { pool, account: await accounts.getAccount(a.id) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Change your call while the pool is still open (before kick-off).
  app.post('/api/pools/:id/prediction', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { prediction?: { homeGoals?: number; awayGoals?: number } };
    try {
      const pool = await store.updatePrediction({
        poolId: id,
        userId: a.id,
        predHome: b.prediction?.homeGoals ?? 0,
        predAway: b.prediction?.awayGoals ?? 0,
      });
      return { pool };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Leave an open pool before kick-off — refunds the stake.
  app.post('/api/pools/:id/leave', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    try {
      const pool = await store.leavePool({ poolId: id, userId: a.id });
      return { pool, account: await accounts.getAccount(a.id) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/me/pools', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    return { pools: await store.poolsForUser(a.id) };
  });

  app.get('/api/fixtures/:id/pools', async (req) => {
    const { id } = req.params as { id: string };
    return { pools: await store.publicPoolsForFixture(id) };
  });

  // ---- ORGANIZE — knockout tournaments ----

  app.post('/api/tournaments', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const b = (req.body ?? {}) as {
      name?: string;
      maxPlayers?: number;
      entryFee?: number;
      splitBps?: number[];
      currency?: 'points' | 'usdt';
    };
    try {
      return organize.createTournament({ organizerId: a.id, ...b });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/tournaments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = await organize.getTournament(id);
    if (!t) return reply.code(404).send({ error: 'tournament not found' });
    return t;
  });

  app.get('/api/tournaments/code/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const t = await organize.getTournamentByCode(code);
    if (!t) return reply.code(404).send({ error: 'no cup with that code' });
    return t;
  });

  app.get('/api/me/tournaments', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    return { tournaments: await organize.tournamentsForUser(a.id) };
  });

  app.post('/api/tournaments/join', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const b = (req.body ?? {}) as { code?: string; tournamentId?: string };
    try {
      return await organize.joinTournament({ code: b.code, tournamentId: b.tournamentId, userId: a.id });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/tournaments/:id/entrants', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { name?: string };
    try {
      return organize.addEntrant({ tournamentId: id, organizerId: a.id, name: b.name || 'Entrant' });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/tournaments/:id/start', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { seeding?: 'random' | 'join' };
    try {
      return organize.startTournament({ tournamentId: id, organizerId: a.id, seeding: b.seeding });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/tournaments/:id/matches/:mid/report', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id, mid } = req.params as { id: string; mid: string };
    const b = (req.body ?? {}) as { homeScore?: number; awayScore?: number; penaltyWinner?: 'home' | 'away' };
    try {
      return await organize.reportMatch({
        tournamentId: id,
        matchId: mid,
        organizerId: a.id,
        homeScore: b.homeScore ?? 0,
        awayScore: b.awayScore ?? 0,
        penaltyWinner: b.penaltyWinner,
      });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/tournaments/:id/cancel', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    try {
      return await organize.cancelTournament({ tournamentId: id, organizerId: a.id });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // The Gaffer as tournament director — on-device narration over SSE.
  app.get('/api/organize/:id/ai', (req, reply) => {
    const { id } = req.params as { id: string };
    const { kind, matchId } = req.query as { kind?: string; matchId?: string };
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    const allowed: DirectorKind[] = ['draw', 'preview', 'recap', 'trophy'];
    const k = (allowed as string[]).includes(kind ?? '') ? (kind as DirectorKind) : 'draw';
    (async () => {
      try {
        for await (const ev of streamDirector(id, k, matchId)) send(ev);
      } catch (err) {
        send({ type: 'error', message: (err as Error).message });
      } finally {
        raw.write('event: end\ndata: {}\n\n');
        raw.end();
      }
    })();
  });

  // ---- FANTASY — salary-cap mini-leagues ----

  app.get('/api/fantasy/players', async () => ({ players: fantasy.listPlayers() }));

  app.get('/api/fantasy/players/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = fantasy.playerDetail(id);
    if (!detail) return reply.code(404).send({ error: 'unknown player' });
    return detail;
  });

  app.get('/api/fantasy/draft', async () => fantasy.autoDraft());

  app.post('/api/fantasy/leagues', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const b = (req.body ?? {}) as { name?: string; buyIn?: number; splitBps?: number[]; currency?: 'points' | 'usdt' };
    try {
      return fantasy.createLeague({ creatorId: a.id, ...b });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/fantasy/leagues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const lg = await fantasy.getLeague(id);
    if (!lg) return reply.code(404).send({ error: 'league not found' });
    return lg;
  });

  app.get('/api/fantasy/leagues/code/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const lg = await fantasy.getLeagueByCode(code);
    if (!lg) return reply.code(404).send({ error: 'no league with that code' });
    return lg;
  });

  app.get('/api/me/fantasy', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    return { leagues: await fantasy.leaguesForUser(a.id) };
  });

  app.post('/api/fantasy/leagues/join', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const b = (req.body ?? {}) as {
      code?: string;
      leagueId?: string;
      squadIds?: string[];
      starterIds?: string[];
      captainId?: string;
      viceId?: string;
      chip?: 'tc' | 'bb' | null;
    };
    try {
      return await fantasy.joinLeague({
        code: b.code,
        leagueId: b.leagueId,
        userId: a.id,
        squadIds: b.squadIds ?? [],
        starterIds: b.starterIds ?? [],
        captainId: b.captainId ?? '',
        viceId: b.viceId ?? '',
        chip: b.chip ?? null,
      });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/fantasy/leagues/:id/start', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    try {
      return fantasy.startLeague({ leagueId: id, creatorId: a.id });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/fantasy/leagues/:id/settle', async (req, reply) => {
    const a = await authed(req);
    if (!a) return reply.code(401).send({ error: 'sign in first' });
    const { id } = req.params as { id: string };
    try {
      return await fantasy.settleLeague({ leagueId: id, creatorId: a.id });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // The Gaffer's on-device squad verdict — SSE.
  app.get('/api/fantasy/ai', (req, reply) => {
    const { players, captain, kind } = req.query as { players?: string; captain?: string; kind?: string };
    const ids = (players || '').split(',').map((s) => s.trim()).filter(Boolean);
    const k: FantasyAiKind = kind === 'captain' ? 'captain' : 'review';
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    (async () => {
      try {
        for await (const ev of streamFantasyAI(ids, captain || '', k)) send(ev);
      } catch (err) {
        send({ type: 'error', message: (err as Error).message });
      } finally {
        raw.write('event: end\ndata: {}\n\n');
        raw.end();
      }
    })();
  });

  app.get('/api/health', async () => ({
    ok: true,
    mode: config.mode,
    network: {
      key: config.network.key,
      label: config.network.label,
      kind: config.network.kind, // 'local' | 'testnet' | 'mainnet'
      chainId: config.chainId,
      explorer: config.network.explorer,
      faucet: config.network.faucet,
    },
    chainReady: manager.isReady(),
    walletBackend: manager.isReady() ? manager.walletBackend() : 'initialising',
    ai: aiStatus(),
    usdt: manager.isReady() ? manager.usdtToken() : null,
    operator: manager.isReady() ? manager.operatorAddress() : null,
  }));

  app.get('/api/ai/status', async () => aiStatus());

  app.post('/api/ai/warmup', async () => {
    ensureLoaded().catch(() => {});
    return aiStatus();
  });

  app.get('/api/fixtures', async () => manager.allFixtures());

  app.get('/api/fixtures/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const f = manager.fixtureSummary(id);
    if (!f) return reply.code(404).send({ error: 'unknown fixture' });
    return f;
  });

  app.post('/api/wallet', async (req, reply) => {
    const body = (req.body ?? {}) as { displayName?: string };
    const name = (body.displayName || 'You').toString().slice(0, 40);
    try {
      return await manager.createWallet(name);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.get('/api/wallet/:address/balance', async (req, reply) => {
    const { address } = req.params as { address: string };
    try {
      const wallet = await import('../wdk/wallet.js');
      const bal = await wallet.tokenBalance(address as Address, manager.usdtToken());
      return { address, usdtHuman: Number(bal) / 10 ** config.usdtDecimals };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.get('/api/pool/:fixtureId', async (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const view = await manager.poolView(fixtureId);
    if (!view) return reply.code(404).send({ error: 'no pool yet', fixtureId });
    return view;
  });

  app.post('/api/pool/:fixtureId/join', async (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const body = (req.body ?? {}) as {
      address?: string;
      displayName?: string;
      prediction?: { homeGoals?: number; awayGoals?: number };
    };
    if (!body.address) return reply.code(400).send({ error: 'address required' });
    const prediction = clampScore(body.prediction);
    try {
      await manager.joinPool({
        fixtureId,
        address: body.address as Address,
        prediction,
        displayName: body.displayName,
        isBot: false,
      });
      return await manager.poolView(fixtureId);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/pool/:fixtureId/settle', async (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const body = (req.body ?? {}) as { homeGoals?: number; awayGoals?: number };
    const result = clampScore(body);
    try {
      await manager.settle(fixtureId, result);
      return await manager.poolView(fixtureId);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Real-time fixtures push — one SSE connection carries every live score/status/
  // minute change (real feed + demo sim) so the UI never has to poll for them.
  app.get('/api/stream', (_req, reply) => {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);

    // Prime the client with the current full snapshot, then stream deltas.
    send({ type: 'snapshot', fixtures: manager.allFixtures() });
    const unsub = manager.onLiveChange((ids) => {
      const fixtures = ids.map((id) => manager.fixtureSummary(id)).filter(Boolean);
      if (fixtures.length) send({ type: 'fixtures', fixtures });
    });
    // Comment heartbeat keeps proxies/browsers from idling the connection out.
    const hb = setInterval(() => raw.write(': ping\n\n'), 25_000);

    const close = () => {
      clearInterval(hb);
      unsub();
    };
    raw.on('close', close);
    raw.on('error', close);
  });

  // On-device Gaffer — Server-Sent Events stream.
  app.get('/api/gaffer/:fixtureId', (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    (async () => {
      try {
        for await (const ev of streamGafferRead(fixtureId)) send(ev);
      } catch (err) {
        send({ type: 'error', message: (err as Error).message });
      } finally {
        raw.write('event: end\ndata: {}\n\n');
        raw.end();
      }
    })();
  });

  // On-device LIVE in-play reaction — SSE, using the current live score.
  app.get('/api/live/:fixtureId/commentary', (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const live = manager.liveState(fixtureId);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    (async () => {
      try {
        if (!live) {
          send({ type: 'error', message: 'unknown fixture' });
        } else {
          for await (const ev of streamLiveReaction(fixtureId, {
            homeGoals: live.homeGoals,
            awayGoals: live.awayGoals,
            minute: live.minute,
          }))
            send(ev);
        }
      } catch (err) {
        send({ type: 'error', message: (err as Error).message });
      } finally {
        raw.write('event: end\ndata: {}\n\n');
        raw.end();
      }
    })();
  });

  // Demo: drive the live in-play experience without waiting for a real kickoff.
  app.post('/api/dev/live/:fixtureId', async (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const body = (req.body ?? {}) as {
      minute?: number | string;
      homeGoals?: number;
      awayGoals?: number;
      status?: 'live' | 'finished';
    };
    const { homeGoals, awayGoals } = clampScore(body);
    manager.simulateLive(fixtureId, {
      minute: body.minute ?? 1,
      home: homeGoals,
      away: awayGoals,
      status: body.status === 'finished' ? 'finished' : 'live',
    });
    return manager.fixtureSummary(fixtureId) ?? reply.code(404).send({ error: 'unknown fixture' });
  });

  app.delete('/api/dev/live/:fixtureId', async (req) => {
    const { fixtureId } = req.params as { fixtureId: string };
    manager.clearLive(fixtureId);
    return manager.fixtureSummary(fixtureId);
  });

  // ---- on-device voice ----

  app.get('/api/voice/status', async () => voice.voiceStatus());

  app.post('/api/voice/speak', async (req, reply) => {
    const body = (req.body ?? {}) as { text?: string };
    const text = (body.text || '').toString().slice(0, 600).trim();
    if (!text) return reply.code(400).send({ error: 'text required' });
    try {
      const wav = await voice.speak(text);
      return reply.header('Content-Type', 'audio/wav').send(wav);
    } catch (err) {
      return reply.code(503).send({ error: `TTS unavailable: ${(err as Error).message}` });
    }
  });

  app.post('/api/voice/transcribe', async (req, reply) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length < 44) {
      return reply.code(400).send({ error: 'expected a WAV audio body' });
    }
    try {
      const text = await voice.transcribeWav(buf);
      return { text };
    } catch (err) {
      return reply.code(503).send({ error: `STT unavailable: ${(err as Error).message}` });
    }
  });

  // Freeform question answered on-device — SSE (powers voice Q&A).
  app.get('/api/gaffer/:fixtureId/ask', (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const { q } = req.query as { q?: string };
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    (async () => {
      try {
        if (!q || !q.trim()) send({ type: 'error', message: 'no question' });
        else for await (const ev of streamAsk(fixtureId, q)) send(ev);
      } catch (err) {
        send({ type: 'error', message: (err as Error).message });
      } finally {
        raw.write('event: end\ndata: {}\n\n');
        raw.end();
      }
    })();
  });

  // ---- serve the built SPA (single-service deploy) ----
  // `wildcard: false` registers a route per real file (index.html, /assets/*, …)
  // instead of a catch-all `/*`, so the API routes and SSE streams above are never
  // shadowed. Anything that isn't a real file OR an /api route falls through to the
  // handler below, which serves index.html so client-side routing (Predict, Fantasy,
  // Organize deep links) works on refresh.
  if (config.serveWeb) {
    app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

function clampScore(s?: { homeGoals?: number; awayGoals?: number }): { homeGoals: number; awayGoals: number } {
  const clamp = (n: unknown) => Math.max(0, Math.min(20, Math.round(Number(n) || 0)));
  return { homeGoals: clamp(s?.homeGoals), awayGoals: clamp(s?.awayGoals) };
}
