/**
 * On-device seed vault — the recovery phrase encrypted at rest with the user's
 * PIN, so a returning user can re-load their signing key without re-typing 12
 * words. The seed is NEVER stored in plaintext and NEVER leaves the device — it's
 * decrypted here only to sign locally (client-side custody); the server never sees
 * it. PIN-derived AES-GCM key via PBKDF2; all through the browser's Web Crypto.
 *
 * Requires a secure context (https or localhost) for crypto.subtle — both our
 * hosted origin and the local demo qualify.
 */

const VAULT_KEY = "gaffer-vault";
const PBKDF2_ITERS = 150_000;

interface VaultBlob {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 ciphertext
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Is there an encrypted seed on this device? */
export function hasVault(): boolean {
  return !!localStorage.getItem(VAULT_KEY);
}

/** Wipe the on-device seed (sign-out / forgot-PIN). */
export function clearVault(): void {
  localStorage.removeItem(VAULT_KEY);
}

/** Encrypt the recovery phrase under a PIN and store it on this device. */
export async function saveSeed(mnemonic: string, pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(mnemonic.trim()) as BufferSource);
  const blob: VaultBlob = { v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

/** Decrypt the on-device seed with a PIN. Throws "wrong PIN" on a bad PIN. */
export async function openSeed(pin: string): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error("no vault on this device");
  const blob = JSON.parse(raw) as VaultBlob;
  const key = await deriveKey(pin, fromB64(blob.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
    return dec.decode(pt);
  } catch {
    throw new Error("wrong PIN");
  }
}
