/**
 * Room chat — live group chat inside ANY room: a prediction pool, a knockout cup, or a
 * fantasy league. One model for all three: a message's room is the namespaced key
 * `pool:<id>` | `cup:<id>` | `league:<id>` (the same convention the escrow uses), so
 * chat generalises without a table per product.
 *
 * Persisted in Postgres (`room_messages`) so history survives a reload/restart, and
 * fanned out to connected members in real time via an in-process pub/sub bus (the same
 * shape as the fixtures `onLiveChange` emitter behind `/api/stream`). Only the people
 * who JOINED a room may read or post — membership is resolved per-kind against
 * poolMembers / tournamentParticipants / fantasySquads (the organizer/creator counts
 * too). Sender identity (handle/avatar) is denormalized onto each message at read time.
 *
 * The bus is per-process: fine on a single Railway instance, and on restart live
 * subscribers just reconnect (EventSource auto-retries) and re-prime from the persisted
 * history — no message is lost, only the socket blips.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  roomMessages,
  poolMembers,
  tournaments,
  tournamentParticipants,
  fantasyLeagues,
  fantasySquads,
  users,
} from '../db/schema.js';

/** The three room families that can host a chat. */
export type RoomKind = 'pool' | 'cup' | 'league';
export const isRoomKind = (k: string): k is RoomKind => k === 'pool' || k === 'cup' || k === 'league';
/** Namespaced room key stored on every message, e.g. `cup:abc123`. */
export const roomKey = (kind: RoomKind, id: string): string => `${kind}:${id}`;

/** A chat message as the client sees it — the row plus the sender's identity. */
export interface ChatMessage {
  id: string;
  room: string; // 'pool:<id>' | 'cup:<id>' | 'league:<id>'
  userId: string;
  handle: string;
  avatar: string | null;
  body: string;
  createdAt: string; // ISO
}

const MAX_BODY = 500; // a chat line, not an essay — keeps the stream light

// ---- in-process pub/sub (per room) ----
type Listener = (m: ChatMessage) => void;
const rooms = new Map<string, Set<Listener>>();

/** Subscribe to a room's live messages; returns an unsubscribe fn. */
export function subscribe(room: string, fn: Listener): () => void {
  let set = rooms.get(room);
  if (!set) rooms.set(room, (set = new Set()));
  set.add(fn);
  return () => {
    const s = rooms.get(room);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) rooms.delete(room);
  };
}

function publish(m: ChatMessage): void {
  rooms.get(m.room)?.forEach((fn) => {
    try {
      fn(m);
    } catch {
      /* a broken subscriber must not break the sender */
    }
  });
}

const has = async (q: Promise<{ x: string }[]>): Promise<boolean> => !!(await q)[0];

/**
 * May this user read/post in this room? Membership IS the allow-list, resolved per kind:
 *   pool   → staked the pool (poolMembers)
 *   cup    → entered the bracket (tournamentParticipants) OR is the organizer
 *   league → has a squad (fantasySquads) OR is the league creator
 */
export async function canChat(kind: RoomKind, id: string, userId: string): Promise<boolean> {
  if (kind === 'pool') {
    return has(
      db.select({ x: poolMembers.id }).from(poolMembers).where(and(eq(poolMembers.poolId, id), eq(poolMembers.userId, userId))).limit(1),
    );
  }
  if (kind === 'cup') {
    return (
      (await has(
        db
          .select({ x: tournamentParticipants.id })
          .from(tournamentParticipants)
          .where(and(eq(tournamentParticipants.tournamentId, id), eq(tournamentParticipants.userId, userId)))
          .limit(1),
      )) ||
      has(db.select({ x: tournaments.id }).from(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.organizerId, userId))).limit(1))
    );
  }
  // league
  return (
    (await has(
      db.select({ x: fantasySquads.id }).from(fantasySquads).where(and(eq(fantasySquads.leagueId, id), eq(fantasySquads.userId, userId))).limit(1),
    )) ||
    has(db.select({ x: fantasyLeagues.id }).from(fantasyLeagues).where(and(eq(fantasyLeagues.id, id), eq(fantasyLeagues.creatorId, userId))).limit(1))
  );
}

/** The last `limit` messages in a room, oldest→newest (ready to render top-down). */
export async function recentMessages(room: string, limit = 50): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      id: roomMessages.id,
      room: roomMessages.room,
      userId: roomMessages.userId,
      body: roomMessages.body,
      createdAt: roomMessages.createdAt,
      handle: users.handle,
      avatar: users.avatar,
    })
    .from(roomMessages)
    .innerJoin(users, eq(users.id, roomMessages.userId))
    .where(eq(roomMessages.room, room))
    .orderBy(desc(roomMessages.createdAt)) // newest first for the LIMIT…
    .limit(limit);
  return rows.reverse().map(toMessage); // …then flip to chronological for the UI
}

/**
 * Post a message to a room. The caller has already verified membership (canChat); this
 * validates the body, persists it, and publishes to every live subscriber. Returns the
 * stored message (echoed to the sender too — clients render the server's canonical copy).
 */
export async function postMessage(opts: { room: string; userId: string; body: unknown }): Promise<ChatMessage> {
  const body = String(opts.body ?? '').trim();
  if (!body) throw new Error('write something first');
  if (body.length > MAX_BODY) throw new Error(`keep it under ${MAX_BODY} characters`);

  const sender = (await db.select({ handle: users.handle, avatar: users.avatar }).from(users).where(eq(users.id, opts.userId)).limit(1))[0];
  if (!sender) throw new Error('unknown sender');

  const row = { id: randomUUID(), room: opts.room, userId: opts.userId, body, createdAt: new Date() };
  await db.insert(roomMessages).values(row);

  const msg = toMessage({ ...row, handle: sender.handle, avatar: sender.avatar });
  publish(msg);
  return msg;
}

function toMessage(r: {
  id: string;
  room: string;
  userId: string;
  body: string;
  createdAt: Date;
  handle: string;
  avatar: string | null;
}): ChatMessage {
  return {
    id: r.id,
    room: r.room,
    userId: r.userId,
    handle: r.handle,
    avatar: r.avatar ?? null,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  };
}
