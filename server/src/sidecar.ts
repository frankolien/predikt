/**
 * Predikt desktop AI sidecar — on-device QVAC pundit + voice.
 *
 * The Tauri desktop app spawns this alongside the window. It serves ONLY the
 * AI/voice routes, reusing the exact same `qvac/*` engine + `football` feed as
 * the main server — but with **no database, no chain, no secrets**. Money and
 * multiplayer data still go to the hosted backend; the model runs right here on
 * the user's own machine, so the pundit + voice that fall back to a scripted
 * "mock" in the cloud are GENUINELY on-device here (QVAC ships native desktop
 * prebuilds). Organize-director AI is the one AI route left on the hosted
 * backend (it needs the tournament DB), so the desktop client keeps that on the
 * money origin.
 *
 * Run:  GAFFER_SIDECAR_PORT=8799 tsx src/sidecar.ts
 */
import './env.js'; // load root .env FIRST so the live football feed (fd- ids) matches the hosted backend
import Fastify, { type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { initFootball, getFixture, hydrateFromSummaries, type FixtureSummaryInput } from './football/index.js';
import { streamGafferRead, streamLiveReaction, streamAsk } from './qvac/service.js';
import { streamFantasyAI, type FantasyAiKind } from './fantasy/ai.js';
import * as voice from './qvac/voice.js';
import { status as aiStatus, ensureLoaded } from './qvac/engine.js';

const PORT = Number(process.env.GAFFER_SIDECAR_PORT || 8799);
const HOST = '127.0.0.1'; // localhost only — never exposed off the machine

// Packaged desktop builds ship no data-provider key, so the sidecar can't pull
// fixtures from a live provider on its own — and even if it could, a different
// provider yields different ids than the hosted backend the user is looking at.
// Instead we mirror the hosted backend's fixture list (same ids, no secret in
// the app). Rust passes this in for the packaged app; unset in dev, where the
// sidecar's own .env key already lines the ids up.
const FIXTURES_URL = (process.env.GAFFER_FIXTURES_URL || '').replace(/\/$/, '');
const FIXTURES_REFRESH_MS = 20_000; // keep live scores fresh for in-play reactions

/** Mirror the hosted backend's fixtures into the local maps, then keep them fresh. */
async function initRemoteFixtures(url: string): Promise<void> {
  const pull = async () => {
    const res = await fetch(`${url}/api/fixtures`);
    if (!res.ok) throw new Error(`fixtures ${res.status}`);
    const list = (await res.json()) as FixtureSummaryInput[];
    const n = hydrateFromSummaries(Array.isArray(list) ? list.filter(Boolean) : []);
    return n;
  };
  const n = await pull();
  console.log(`[sidecar] mirrored ${n} fixtures from ${url} (ids match the app)`);
  // Refresh loop — best-effort; a transient failure just keeps the last snapshot.
  setInterval(() => {
    pull().catch((e) => console.warn('[sidecar] fixtures refresh:', (e as Error).message));
  }, FIXTURES_REFRESH_MS).unref();
}

/** Open a Server-Sent-Events stream and return a tiny writer. */
function sse(reply: FastifyReply) {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  return {
    send: (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`),
    end: () => {
      raw.write('event: end\ndata: {}\n\n');
      raw.end();
    },
    raw,
  };
}

/** Stream an async generator of events down an SSE connection. */
async function pipe(reply: FastifyReply, gen: AsyncGenerator<unknown>) {
  const s = sse(reply);
  try {
    for await (const ev of gen) s.send(ev);
  } catch (err) {
    s.send({ type: 'error', message: (err as Error).message });
  } finally {
    s.end();
  }
}

export function buildSidecar() {
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
  app.register(cors, { origin: true });
  app.addContentTypeParser(
    ['audio/wav', 'audio/x-wav', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  // Liveness + on-device model status.
  app.get('/api/health', async () => ({ ok: true, sidecar: true, ai: aiStatus() }));
  app.get('/api/ai/status', async () => aiStatus());
  app.post('/api/ai/warmup', async () => {
    ensureLoaded().catch(() => {});
    return aiStatus();
  });

  // The Gaffer's pre-match read — on-device SSE.
  app.get('/api/gaffer/:fixtureId', (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    return pipe(reply, streamGafferRead(fixtureId));
  });

  // Freeform question answered on-device — powers voice Q&A.
  app.get('/api/gaffer/:fixtureId/ask', (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const { q } = req.query as { q?: string };
    if (!q || !q.trim()) {
      const s = sse(reply);
      s.send({ type: 'error', message: 'no question' });
      return s.end();
    }
    return pipe(reply, streamAsk(fixtureId, q));
  });

  // Live in-play reaction — uses the current feed score (no manager/chain).
  app.get('/api/live/:fixtureId/commentary', (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string };
    const f = getFixture(fixtureId);
    if (!f) {
      const s = sse(reply);
      s.send({ type: 'error', message: 'unknown fixture' });
      return s.end();
    }
    return pipe(
      reply,
      streamLiveReaction(fixtureId, {
        homeGoals: f.result?.homeGoals ?? 0,
        awayGoals: f.result?.awayGoals ?? 0,
        minute: f.minute ?? null,
      }),
    );
  });

  // The Gaffer's fantasy squad verdict — on-device SSE.
  app.get('/api/fantasy/ai', (req, reply) => {
    const { players, captain, kind } = req.query as { players?: string; captain?: string; kind?: string };
    const ids = (players || '').split(',').map((s) => s.trim()).filter(Boolean);
    const k: FantasyAiKind = kind === 'captain' ? 'captain' : 'review';
    return pipe(reply, streamFantasyAI(ids, captain || '', k));
  });

  // ---- on-device voice (Whisper STT + Supertonic TTS via QVAC) ----
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

  return app;
}

async function main() {
  // Load fixtures so the pundit has match context. Packaged builds mirror the
  // hosted backend (ids match, no key shipped); dev uses the live feed directly.
  if (FIXTURES_URL) {
    await initRemoteFixtures(FIXTURES_URL).catch((e) =>
      console.warn('[sidecar] remote fixtures:', (e as Error).message),
    );
  } else {
    await initFootball().catch((e) => console.warn('[sidecar] football feed:', (e as Error).message));
  }
  // Warm the on-device model in the background — the first token pays for it.
  ensureLoaded().catch(() => {});

  const app = buildSidecar();
  await app.listen({ port: PORT, host: HOST });
  console.log(`[sidecar] on-device AI ready at http://${HOST}:${PORT}`);
}

// Only auto-run when invoked directly (not when imported for tests).
main().catch((err) => {
  console.error('[sidecar] failed to start:', err);
  process.exit(1);
});
