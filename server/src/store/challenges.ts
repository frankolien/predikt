/**
 * SIWE login challenges — single-use nonces, short TTL, in memory.
 *
 * Client-side custody auth: the server issues a nonce, the client signs a SIWE
 * (EIP-4361) message containing it with its own key, and we verify + consume the
 * nonce. No secret is ever transmitted. In-memory matches the demo's no-persist
 * ethos — a redeploy just invalidates outstanding (5-min) challenges, which is
 * harmless (the client simply requests a new one).
 */
import { randomBytes } from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;

interface Challenge {
  address: string; // lowercased
  expiresAt: number;
}

const challenges = new Map<string, Challenge>(); // key: nonce

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k);
}

/** Issue a fresh single-use nonce bound to an address (SIWE-safe alphanumeric). */
export function issueNonce(address: string): string {
  const nonce = randomBytes(16).toString('hex'); // 32 hex chars — alphanumeric, ≥8
  challenges.set(nonce, { address: address.toLowerCase(), expiresAt: Date.now() + TTL_MS });
  sweep();
  return nonce;
}

/**
 * Consume a nonce for an address. Single-use: deleted on first check regardless of
 * outcome (so a replay of the same nonce always fails). Returns false if unknown,
 * expired, or bound to a different address.
 */
export function consumeNonce(nonce: string, address: string): boolean {
  const c = challenges.get(nonce);
  if (!c) return false;
  challenges.delete(nonce);
  if (c.expiresAt < Date.now()) return false;
  return c.address === address.toLowerCase();
}
