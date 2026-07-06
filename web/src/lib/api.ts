/** Typed client for the Gaffer API. */

/**
 * Backend base URL. Empty = same-origin — the default for local dev (Vite proxy)
 * and the single-service server that serves the SPA + API together. Set
 * `VITE_API_BASE` at build time to an absolute URL when the frontend is hosted
 * separately from the backend (e.g. a Vercel frontend calling the Railway API).
 * The backend allows cross-origin fetch + EventSource, so no proxy is needed.
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");

export interface TeamCard {
  id: string;
  name: string;
  code: string;
  flag?: string;
  crest?: string | null; // badge URL from the real feed (rendered grayscale)
  fifaRank: number;
  form: Array<"W" | "D" | "L">;
  keyPlayer: string;
}

export interface FixtureSummary {
  id: string;
  stage: string;
  kickoff: string;
  venue: string;
  status: "scheduled" | "locked" | "settled";
  result: { homeGoals: number; awayGoals: number } | null;
  /** Live match state from the real data feed (additive). */
  matchStatus?: "scheduled" | "live" | "finished";
  minute?: number | string | null;
  isLive?: boolean;
  home: TeamCard;
  away: TeamCard;
  poolExists: boolean;
  stake: number;
  playerCount: number;
}

export interface PoolEntryView {
  address: string;
  displayName: string;
  prediction: { homeGoals: number; awayGoals: number };
  stake: number;
  isBot: boolean;
  approveTx: string;
  depositTx: string;
  won: boolean | null;
  winnings: number | null;
  exactScore: boolean;
}

export interface PoolView {
  fixtureId: string;
  escrow: string;
  stake: number;
  status: "open" | "settled";
  potHuman: number;
  playerCount: number;
  result: { homeGoals: number; awayGoals: number } | null;
  settleTx: string | null;
  fixture: FixtureSummary;
  entries: PoolEntryView[];
}

export interface Wallet {
  address: string;
  displayName: string;
  mnemonic: string;
  backend: string;
  usdtHuman: number;
}

export interface AiStatus {
  state: "idle" | "loading" | "ready" | "mock" | "error";
  model: string;
  progress: number;
  detail: string;
  onDevice: boolean;
}

/**
 * True when the on-device model is genuinely running (ready, or warming up) —
 * false for the scripted fallback. Gates the AI-forward UI so a scripted backend
 * (e.g. the hosted deploy) leads with the WDK money layer instead of advertising
 * a "scripted" pundit. On-device (local / ngrok) shows the full AI experience.
 */
export const aiLive = (ai?: AiStatus): boolean => !!ai?.onDevice;

export interface NetworkInfo {
  key: string;
  label: string; // "Local" | "Arbitrum Sepolia" | "Arbitrum One"
  kind: "local" | "testnet" | "mainnet";
  chainId: number;
  explorer: string; // block-explorer base, or "" when none (local)
  faucet: boolean;
}

export interface Health {
  ok: boolean;
  mode: string;
  network?: NetworkInfo;
  chainReady: boolean;
  walletBackend: string;
  ai: AiStatus;
  usdt: string | null;
  operator: string | null;
}

// ---- free-to-play accounts + points pools ----

export interface Account {
  id: string;
  handle: string;
  points: number;
}

/** Result of wallet-as-identity sign-in / sign-up. */
export interface WalletAuth {
  account: Account;
  token: string;
  wallet: { address: string; backend: string; usdtHuman: number };
  mnemonic?: string; // returned ONCE, only when a brand-new phrase is generated
  isNew: boolean;
}

export interface PoolMemberView {
  userId: string;
  handle: string;
  prediction: { homeGoals: number; awayGoals: number };
  staked: number;
  won: boolean | null;
  winnings: number | null;
  exact: boolean;
  depositTx?: string | null; // USD₮ buy-in tx hash (usdt pools)
  payoutTx?: string | null; // USD₮ payout tx hash (usdt pools)
}

export interface PointsPool {
  id: string;
  code: string;
  name: string;
  fixtureId: string;
  buyIn: number;
  currency: "points" | "usdt";
  isPublic: boolean;
  status: "open" | "locked" | "settled";
  lockTime: string | null;
  result: { homeGoals: number; awayGoals: number } | null;
  potPoints: number;
  memberCount: number;
  createdAt: string;
  members: PoolMemberView[];
}

// ---- Organize: knockout tournaments ----

export interface TournamentParticipantView {
  id: string;
  userId: string | null;
  name: string;
  code: string;
  seed: number | null;
  status: string;
  staked: number;
  placement: number | null;
  payout: number | null;
  depositTx: string | null;
  payoutTx: string | null;
}

export interface TournamentSide {
  participantId: string | null;
  name: string | null;
  code: string | null;
  score: number | null;
}

export interface TournamentMatchView {
  id: string;
  round: number;
  slot: number;
  status: string;
  decidedBy: string | null;
  winnerParticipantId: string | null;
  home: TournamentSide;
  away: TournamentSide;
}

export interface TournamentRound {
  round: number;
  name: string;
  matches: TournamentMatchView[];
}

export interface Tournament {
  id: string;
  code: string;
  name: string;
  format: string;
  status: "open" | "live" | "completed" | "cancelled";
  currency: "points" | "usdt";
  entryFee: number;
  maxPlayers: number;
  splitBps: number[];
  organizerId: string;
  pot: number;
  participantCount: number;
  totalRounds: number;
  winnerId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  participants: TournamentParticipantView[];
  rounds: TournamentRound[];
}

// ---- Fantasy: salary-cap mini-leagues ----

export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";

export interface FantasyPlayer {
  id: string;
  name: string;
  teamCode: string;
  teamName: string;
  position: FantasyPosition;
  price: number;
}

export type FantasyChip = "tc" | "bb" | null;

export interface FantasyStandingPlayer extends FantasyPlayer {
  isCaptain: boolean;
  isViceCaptain: boolean;
  starter: boolean;
  benchOrder: number;
  active: boolean; // counted toward the score (started / subbed on / bench boost)
  points: number; // counted points (captain multiplied)
  basePoints: number; // raw team score
}

export interface FantasyStanding {
  squadId: string;
  userId: string;
  handle: string;
  rank: number;
  points: number;
  budgetUsed: number;
  captainId: string;
  viceCaptainId: string | null;
  captainedId: string | null; // who actually wore the armband
  chip: FantasyChip;
  formation: string;
  autoSubIn: string[];
  autoSubOut: string[];
  placement: number | null;
  payout: number | null;
  staked: number;
  depositTx?: string | null; // USD₮ buy-in tx hash (usdt leagues)
  payoutTx?: string | null; // USD₮ payout tx hash (usdt leagues)
  players: FantasyStandingPlayer[];
}

export interface FantasyPlayerGame {
  opponent: string;
  opponentCode: string;
  opponentCrest: string | null;
  opponentFlag: string | null;
  home: boolean;
  stage: string | null;
  kickoff: string | null;
  matchStatus: "scheduled" | "live" | "finished";
  isLive: boolean;
  minute: number | string | null;
  score: string | null;
  outcome: "W" | "D" | "L" | null;
}

/** FotMob-style scouting card — real squad details + team WC run + fantasy angle. */
export interface FantasyPlayerDetail {
  id: string;
  name: string;
  teamCode: string;
  teamName: string;
  position: FantasyPosition;
  price: number;
  age: number | null;
  dateOfBirth: string | null;
  nationality: string | null;
  country: string | null;
  crest: string | null;
  flag: string | null;
  fifaRank: number | null;
  form: Array<"W" | "D" | "L">;
  score: number; // base fantasy score (captain doubles it)
  games: FantasyPlayerGame[];
  next: FantasyPlayerGame | null;
  playedCount: number;
}

export interface FantasyLeague {
  id: string;
  code: string;
  name: string;
  creatorId: string;
  buyIn: number;
  currency: "points" | "usdt";
  status: "open" | "live" | "settled";
  splitBps: number[];
  pot: number;
  memberCount: number;
  createdAt: string;
  lockedAt: string | null;
  settledAt: string | null;
  scoreFrom?: string; // scoring epoch — only matches kicking off at/after this count
  scoringStarted?: boolean; // has the first counted match kicked off yet?
  standings: FantasyStanding[];
}

// ---- session token (free-to-play accounts) ----
const TOKEN_KEY = "gaffer-token";
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}/api${path}`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `GET ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    // Only declare a JSON content-type when we actually send a body — otherwise
    // Fastify rejects the empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `POST ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}/api${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  health: () => get<Health>("/health"),
  aiStatus: () => get<AiStatus>("/ai/status"),
  warmup: () => post<AiStatus>("/ai/warmup"),
  fixtures: () => get<FixtureSummary[]>("/fixtures"),
  pool: (fixtureId: string) => get<PoolView>(`/pool/${fixtureId}`),
  createWallet: (displayName: string) => post<Wallet>("/wallet", { displayName }),
  balance: (address: string) => get<{ address: string; usdtHuman: number }>(`/wallet/${address}/balance`),
  join: (
    fixtureId: string,
    address: string,
    prediction: { homeGoals: number; awayGoals: number },
    displayName: string,
  ) => post<PoolView>(`/pool/${fixtureId}/join`, { address, prediction, displayName }),
  settle: (fixtureId: string, homeGoals: number, awayGoals: number) =>
    post<PoolView>(`/pool/${fixtureId}/settle`, { homeGoals, awayGoals }),
  // demo: drive the live experience without waiting for a real kickoff
  simulateLive: (id: string, minute: number, homeGoals: number, awayGoals: number, status: "live" | "finished" = "live") =>
    post<FixtureSummary>(`/dev/live/${id}`, { minute, homeGoals, awayGoals, status }),
  clearLive: (id: string) => del<FixtureSummary>(`/dev/live/${id}`),

  // ---- wallet-as-identity auth (self-custodial) ----
  auth: {
    // Create a brand-new wallet + account; recovery phrase returned once.
    newWallet: (handle?: string) => post<WalletAuth>("/auth/wallet/new", handle ? { handle } : {}),
    // Sign in / recover an account from its BIP-39 recovery phrase.
    restore: (mnemonic: string, handle?: string) =>
      post<WalletAuth>("/auth/wallet/restore", handle ? { mnemonic, handle } : { mnemonic }),
  },

  // ---- free-to-play accounts + points pools ----
  account: {
    create: (handle: string) => post<{ account: Account; token: string }>("/account", { handle }),
    me: () => get<{ account: Account }>("/account"),
    // self-custodial USD₮ wallet (WDK) linked to the account
    wallet: () => get<{ address: string | null; usdtHuman: number; backend?: string }>("/account/wallet"),
    connectWallet: () =>
      post<{ address: string; usdtHuman: number; backend: string; mnemonic?: string }>("/account/wallet"),
  },
  leaderboard: () => get<{ leaderboard: Account[] }>("/leaderboard"),
  pools: {
    create: (fixtureId: string, opts?: { name?: string; buyIn?: number; isPublic?: boolean; currency?: "points" | "usdt" }) =>
      post<PointsPool>("/pools", { fixtureId, ...opts }),
    get: (id: string) => get<PointsPool>(`/pools/${id}`),
    byCode: (code: string) => get<PointsPool>(`/pools/code/${code.trim().toUpperCase()}`),
    join: (args: { poolId?: string; code?: string; prediction: { homeGoals: number; awayGoals: number } }) =>
      post<{ pool: PointsPool; account: Account }>("/pools/join", args),
    updatePrediction: (id: string, prediction: { homeGoals: number; awayGoals: number }) =>
      post<{ pool: PointsPool }>(`/pools/${id}/prediction`, { prediction }),
    leave: (id: string) => post<{ pool: PointsPool | null; account: Account }>(`/pools/${id}/leave`, {}),
    mine: () => get<{ pools: PointsPool[] }>("/me/pools"),
    forFixture: (fixtureId: string) => get<{ pools: PointsPool[] }>(`/fixtures/${fixtureId}/pools`),
  },

  // ---- Organize: knockout tournaments ----
  tournaments: {
    create: (opts: {
      name?: string;
      maxPlayers?: number;
      entryFee?: number;
      splitBps?: number[];
      currency?: "points" | "usdt";
    }) => post<Tournament>("/tournaments", opts),
    get: (id: string) => get<Tournament>(`/tournaments/${id}`),
    byCode: (code: string) => get<Tournament>(`/tournaments/code/${code.trim().toUpperCase()}`),
    mine: () => get<{ tournaments: Tournament[] }>("/me/tournaments"),
    join: (args: { code?: string; tournamentId?: string }) => post<Tournament>("/tournaments/join", args),
    addEntrant: (id: string, name: string) => post<Tournament>(`/tournaments/${id}/entrants`, { name }),
    start: (id: string, seeding?: "random" | "join") => post<Tournament>(`/tournaments/${id}/start`, { seeding }),
    report: (
      id: string,
      matchId: string,
      body: { homeScore: number; awayScore: number; penaltyWinner?: "home" | "away" },
    ) => post<Tournament>(`/tournaments/${id}/matches/${matchId}/report`, body),
    cancel: (id: string) => post<Tournament>(`/tournaments/${id}/cancel`),
  },

  // ---- Fantasy: salary-cap mini-leagues ----
  fantasy: {
    players: () => get<{ players: FantasyPlayer[] }>("/fantasy/players"),
    player: (id: string) => get<FantasyPlayerDetail>(`/fantasy/players/${id}`),
    draft: () => get<{ squadIds: string[]; starterIds: string[]; captainId: string; viceId: string }>("/fantasy/draft"),
    createLeague: (opts: { name?: string; buyIn?: number; splitBps?: number[]; currency?: "points" | "usdt" }) =>
      post<FantasyLeague>("/fantasy/leagues", opts),
    getLeague: (id: string) => get<FantasyLeague>(`/fantasy/leagues/${id}`),
    leagueByCode: (code: string) => get<FantasyLeague>(`/fantasy/leagues/code/${code.trim().toUpperCase()}`),
    mine: () => get<{ leagues: FantasyLeague[] }>("/me/fantasy"),
    join: (args: {
      code?: string;
      leagueId?: string;
      squadIds: string[];
      starterIds: string[];
      captainId: string;
      viceId: string;
      chip?: FantasyChip;
    }) => post<FantasyLeague>("/fantasy/leagues/join", args),
    start: (id: string) => post<FantasyLeague>(`/fantasy/leagues/${id}/start`),
    settle: (id: string) => post<FantasyLeague>(`/fantasy/leagues/${id}/settle`),
  },
};

/** The Gaffer's on-device tournament narration (draw / preview / recap / trophy). */
export type DirectorEvent =
  | { type: "status"; onDevice: boolean; state: string }
  | { type: "delta"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

export function streamDirector(
  tournamentId: string,
  kind: "draw" | "preview" | "recap" | "trophy",
  onEvent: (e: DirectorEvent) => void,
  matchId?: string,
): () => void {
  const qs = new URLSearchParams({ kind });
  if (matchId) qs.set("matchId", matchId);
  const es = new EventSource(`${API_BASE}/api/organize/${tournamentId}/ai?${qs.toString()}`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as DirectorEvent);
    } catch {
      /* ignore keep-alives */
    }
  };
  es.addEventListener("end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

/** The Gaffer's on-device verdict on a fantasy squad (review / captain). */
export function streamFantasyAI(
  playerIds: string[],
  captainId: string,
  kind: "review" | "captain",
  onEvent: (e: DirectorEvent) => void,
): () => void {
  const qs = new URLSearchParams({ players: playerIds.join(","), captain: captainId, kind });
  const es = new EventSource(`${API_BASE}/api/fantasy/ai?${qs.toString()}`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as DirectorEvent);
    } catch {
      /* ignore keep-alives */
    }
  };
  es.addEventListener("end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

/**
 * Real-time fixtures push. One EventSource carries every live score/status/minute
 * change (real feed + demo sim) — the browser no longer polls for them. Returns a
 * cleanup fn. EventSource auto-reconnects, so we don't close on error.
 */
export function streamFixtures(onFixtures: (fixtures: FixtureSummary[]) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/stream`);
  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as { type: string; fixtures?: FixtureSummary[] };
      if (data.fixtures?.length) onFixtures(data.fixtures);
    } catch {
      /* ignore keep-alives */
    }
  };
  return () => es.close();
}

export type LiveEvent =
  | { type: "status"; onDevice: boolean; state: string }
  | { type: "reaction"; delta: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

/** SSE stream of the on-device in-play reaction. Returns a cleanup fn. */
export function streamLiveCommentary(fixtureId: string, onEvent: (e: LiveEvent) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/live/${fixtureId}/commentary`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as LiveEvent);
    } catch {
      /* ignore */
    }
  };
  es.addEventListener("end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

// ---- on-device voice (QVAC TTS + Whisper STT) ----

export interface VoiceStatus {
  tts: "unavailable" | "loading" | "ready";
  stt: "unavailable" | "loading" | "ready";
  ttsModel?: string;
  sttModel?: string;
}

export const voice = {
  status: () => get<VoiceStatus>("/voice/status"),
  /** Synthesize speech on-device; returns a playable WAV blob. */
  speak: async (text: string): Promise<Blob> => {
    const r = await fetch(`${API_BASE}/api/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `speak ${r.status}`);
    return r.blob();
  },
  /** Transcribe a 16 kHz mono WAV on-device (Whisper). */
  transcribe: async (wav: Blob): Promise<{ text: string }> => {
    const r = await fetch(`${API_BASE}/api/voice/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `transcribe ${r.status}`);
    return r.json();
  },
};

/** Freeform voice Q&A: stream a Gaffer answer to a question about a fixture. */
export function streamAsk(fixtureId: string, question: string, onEvent: (e: GafferEvent) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/gaffer/${fixtureId}/ask?q=${encodeURIComponent(question)}`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as GafferEvent);
    } catch {
      /* ignore */
    }
  };
  es.addEventListener("end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

// ---- Gaffer on-device stream (Server-Sent Events) ----

export type GafferEvent =
  | { type: "status"; onDevice: boolean; state: string }
  | { type: "analysis"; delta: string }
  | {
      type: "done";
      read: {
        fixtureId: string;
        predictedScore: { homeGoals: number; awayGoals: number };
        confidence: number;
        analysis: string;
        hotTake: string;
        onDevice: true;
      };
    }
  | { type: "error"; message: string };

/** Opens an SSE connection to the on-device pundit. Returns a cleanup fn. */
export function streamGaffer(fixtureId: string, onEvent: (e: GafferEvent) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/gaffer/${fixtureId}`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as GafferEvent);
    } catch {
      /* ignore keep-alives */
    }
  };
  es.addEventListener("end", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}
