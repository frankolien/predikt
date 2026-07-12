/**
 * Room chat — live messages inside a prediction pool.
 *
 * Persisted in Postgres (`pool_messages`) so history survives a reload/restart, and
 * fanned out to connected members in real time via an in-process pub/sub bus (the same
 * shape as the fixtures `onLiveChange` emitter that powers `/api/stream`). Only pool
 * MEMBERS can read or post — the room is the people who staked it. Sender identity
 * (handle/avatar) is denormalized onto each message at read time so the client never
 * needs a second lookup. Text-only for v1.
 *
 * The bus is in-memory, so it's per-process: fine on a single Railway instance, and if
 * the process restarts, live subscribers just reconnect (EventSource auto-retries) and
 * re-prime from the persisted history — no message is lost, only the socket blips.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { poolMessages, poolMembers, users } from '../db/schema.js';

/** A chat message as the client sees it — the row plus the sender's identity. */
export interface ChatMessage {
  id: string;
  poolId: string;
  userId: string;
  handle: string;
  avatar: string | null;
  body: string;
  createdAt: string; // ISO
}

const MAX_BODY = 500; // a chat line, not an essay — keeps the stream light

// ---- in-process pub/sub (per pool) ----
type Listener = (m: ChatMessage) => void;
const rooms = new Map<string, Set<Listener>>();

/** Subscribe to a pool's live messages; returns an unsubscribe fn. */
export function subscribe(poolId: string, fn: Listener): () => void {
  let set = rooms.get(poolId);
  if (!set) rooms.set(poolId, (set = new Set()));
  set.add(fn);
  return () => {
    const s = rooms.get(poolId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) rooms.delete(poolId);
  };
}

function publish(m: ChatMessage): void {
  rooms.get(m.poolId)?.forEach((fn) => {
    try {
      fn(m);
    } catch {
      /* a broken subscriber must not break the sender */
    }
  });
}

/** Has this user staked this pool? Membership IS the chat allow-list. */
export async function isMember(poolId: string, userId: string): Promise<boolean> {
  const row = (
    await db
      .select({ id: poolMembers.id })
      .from(poolMembers)
      .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.userId, userId)))
      .limit(1)
  )[0];
  return !!row;
}

/** The last `limit` messages in a room, oldest→newest (ready to render top-down). */
export async function recentMessages(poolId: string, limit = 50): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      id: poolMessages.id,
      poolId: poolMessages.poolId,
      userId: poolMessages.userId,
      body: poolMessages.body,
      createdAt: poolMessages.createdAt,
      handle: users.handle,
      avatar: users.avatar,
    })
    .from(poolMessages)
    .innerJoin(users, eq(users.id, poolMessages.userId))
    .where(eq(poolMessages.poolId, poolId))
    .orderBy(desc(poolMessages.createdAt)) // newest first for the LIMIT…
    .limit(limit);
  // …then flip to chronological for the UI.
  return rows.reverse().map(toMessage);
}

/**
 * Post a message to a room. Verifies membership, validates the body, persists it, and
 * publishes it to every live subscriber. Returns the stored message (echoed to the
 * sender too — the client renders from the server's copy, not an optimistic guess).
 */
export async function postMessage(opts: { poolId: string; userId: string; body: unknown }): Promise<ChatMessage> {
  if (!(await isMember(opts.poolId, opts.userId))) throw new Error('join the room to chat');
  const body = String(opts.body ?? '').trim();
  if (!body) throw new Error('write something first');
  if (body.length > MAX_BODY) throw new Error(`keep it under ${MAX_BODY} characters`);

  const sender = (await db.select({ handle: users.handle, avatar: users.avatar }).from(users).where(eq(users.id, opts.userId)).limit(1))[0];
  if (!sender) throw new Error('unknown sender');

  const row = {
    id: randomUUID(),
    poolId: opts.poolId,
    userId: opts.userId,
    body,
    createdAt: new Date(),
  };
  await db.insert(poolMessages).values(row);

  const msg = toMessage({ ...row, handle: sender.handle, avatar: sender.avatar });
  publish(msg);
  return msg;
}

function toMessage(r: {
  id: string;
  poolId: string;
  userId: string;
  body: string;
  createdAt: Date;
  handle: string;
  avatar: string | null;
}): ChatMessage {
  return {
    id: r.id,
    poolId: r.poolId,
    userId: r.userId,
    handle: r.handle,
    avatar: r.avatar ?? null,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  };
}
