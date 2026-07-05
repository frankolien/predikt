/**
 * Typed HTTP client over Gaffer's EXISTING localhost API.
 *
 * The Telegram bot is a thin client: it does NOT reimplement pool / wallet / AI
 * logic. Every call here hits the running Fastify server (default
 * http://127.0.0.1:8787) which owns the chain, WDK wallets and the on-device
 * QVAC pundit. Base URL comes from GAFFER_API.
 */

const BASE = (process.env.GAFFER_API ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

export function apiBase(): string {
  return BASE;
}

/* ------------------------------------------------------------------ types */

export interface TeamSummary {
  id: string;
  name: string;
  code: string;
  flag: string;
  fifaRank: number;
  form: Array<'W' | 'D' | 'L'>;
  keyPlayer: string;
  crest?: string;
  country?: string;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
}

export interface FixtureSummary {
  id: string;
  stage: string;
  kickoff: string;
  venue: string;
  status: 'scheduled' | 'locked' | 'settled';
  result: MatchResult | null;
  matchStatus?: 'scheduled' | 'live' | 'finished';
  minute?: number | string | null;
  isLive: boolean;
  league?: string;
  home: TeamSummary;
  away: TeamSummary;
  poolExists: boolean;
  stake: number;
  playerCount: number;
}

export interface PoolEntryView {
  address: string;
  displayName: string;
  prediction: MatchResult;
  stake: number;
  isBot: boolean;
  approveTx?: string;
  depositTx?: string;
  won?: boolean;
  winnings?: number;
  exactScore?: boolean;
}

export interface PoolView {
  fixtureId: string;
  escrow: string;
  stake: number;
  status: 'open' | 'locked' | 'settled';
  potHuman: number;
  playerCount: number;
  result: MatchResult | null;
  settleTx?: string;
  fixture: FixtureSummary;
  entries: PoolEntryView[];
}

export interface WalletCreated {
  address: string;
  displayName: string;
  mnemonic: string;
  backend: string;
  usdtHuman: number;
}

export interface BalanceView {
  address: string;
  usdtHuman: number;
}

export interface HealthView {
  ok: boolean;
  mode: string;
  chainReady: boolean;
  walletBackend: string;
  ai: {
    state: string;
    model?: string;
    onDevice: boolean;
    progress: number;
    detail?: string;
  };
  usdt: string | null;
  operator: string | null;
}

/** Result of the on-device AI pundit (the "done" SSE event payload). */
export interface GafferRead {
  fixtureId?: string;
  predictedScore: MatchResult;
  confidence: number;
  analysis: string;
  hotTake: string;
  onDevice: boolean;
}

/** SSE events emitted while the Gaffer thinks. */
export type GafferEvent =
  | { type: 'status'; onDevice: boolean; state: string }
  | { type: 'analysis'; delta: string }
  | { type: 'done'; read: GafferRead }
  | { type: 'error'; message: string };

export interface GafferHandlers {
  onStatus?: (ev: { onDevice: boolean; state: string }) => void;
  onDelta?: (delta: string, full: string) => void;
}

/* ------------------------------------------------------------- transport */

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 15_000 } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: body != null ? { 'content-type': 'application/json' } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    if (!res.ok) {
      const msg =
        (json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : `HTTP ${res.status}`) || `HTTP ${res.status}`;
      throw new ApiError(msg, res.status, json);
    }
    return json as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError(`request to ${path} timed out after ${timeoutMs}ms`, 0);
    }
    throw new ApiError(
      `cannot reach Gaffer API at ${BASE} (${(err as Error).message})`,
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- endpoints */

export function getHealth(): Promise<HealthView> {
  return request<HealthView>('/api/health');
}

export function getFixtures(): Promise<FixtureSummary[]> {
  return request<FixtureSummary[]>('/api/fixtures');
}

export async function getFixture(id: string): Promise<FixtureSummary> {
  try {
    return await request<FixtureSummary>(`/api/fixtures/${encodeURIComponent(id)}`);
  } catch (err) {
    // Fall back to scanning the list if the per-id route is unavailable.
    if (err instanceof ApiError && err.status === 404) {
      const all = await getFixtures();
      const found = all.find((f) => f.id === id);
      if (found) return found;
    }
    throw err;
  }
}

/** Returns null when no pool exists yet (API answers 404). */
export async function getPool(fixtureId: string): Promise<PoolView | null> {
  try {
    return await request<PoolView>(`/api/pool/${encodeURIComponent(fixtureId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function createWallet(displayName: string): Promise<WalletCreated> {
  return request<WalletCreated>('/api/wallet', {
    method: 'POST',
    body: { displayName },
    timeoutMs: 30_000,
  });
}

export function getBalance(address: string): Promise<BalanceView> {
  return request<BalanceView>(`/api/wallet/${encodeURIComponent(address)}/balance`);
}

export function joinPool(
  fixtureId: string,
  input: { address: string; displayName?: string; prediction: MatchResult },
): Promise<PoolView> {
  // On-chain approve + deposit runs server-side; give it room.
  return request<PoolView>(`/api/pool/${encodeURIComponent(fixtureId)}/join`, {
    method: 'POST',
    body: input,
    timeoutMs: 90_000,
  });
}

/**
 * Consume the on-device Gaffer SSE stream via fetch, aggregating `analysis`
 * deltas and resolving with the final `done` read. Optional handlers fire on
 * status changes and on each delta (with the running text) so the caller can
 * live-edit a Telegram message.
 */
export async function streamGaffer(
  fixtureId: string,
  handlers: GafferHandlers = {},
): Promise<GafferRead> {
  const res = await fetch(`${BASE}/api/gaffer/${encodeURIComponent(fixtureId)}`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) {
    throw new ApiError(`gaffer stream failed (HTTP ${res.status})`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let done: GafferRead | null = null;
  let errorMsg: string | null = null;

  const handleFrame = (frame: string) => {
    for (const line of frame.split('\n')) {
      const trimmed = line.replace(/\r$/, '').trimStart();
      if (!trimmed.startsWith('data:')) continue; // ignore `event:` etc.
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      let ev: GafferEvent;
      try {
        ev = JSON.parse(payload) as GafferEvent;
      } catch {
        continue;
      }
      switch (ev.type) {
        case 'status':
          handlers.onStatus?.({ onDevice: ev.onDevice, state: ev.state });
          break;
        case 'analysis':
          full += ev.delta;
          handlers.onDelta?.(ev.delta, full);
          break;
        case 'done':
          done = ev.read;
          break;
        case 'error':
          errorMsg = ev.message;
          break;
      }
    }
  };

  try {
    for (;;) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      // SSE frames are separated by a blank line (\n\n).
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        handleFrame(frame);
      }
    }
    if (buffer.trim()) handleFrame(buffer);
  } finally {
    reader.releaseLock?.();
  }

  if (errorMsg) throw new ApiError(errorMsg, 0);
  if (!done) throw new ApiError('gaffer stream ended without a read', 0);
  return done;
}
