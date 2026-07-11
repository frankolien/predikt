/**
 * Client-side custody orchestration — the seed never leaves this device.
 *
 * Sign-up/sign-in prove ownership by SIGNING a server-issued SIWE challenge (no
 * phrase is transmitted). Sending USD₮ builds + signs the tx locally and relays
 * the pre-signed raw tx (the server broadcasts, never holds a key). This is the
 * glue between ./signer (viem, local key) and ./api (the relay/verify endpoints).
 * See docs/custody-plan.md.
 */
import type { Address } from "viem";
import { api, type Health, type WalletAuth } from "./api";
import * as signer from "./signer";
import { keychainAvailable, keychainGet, SEED_KEY } from "./keychain";

/**
 * In-memory session seed. To sign transactions client-side we keep the decrypted
 * phrase in memory while the wallet is "unlocked" (exactly like Solflare/Phantom).
 * It is NEVER persisted here (the vault/keychain do that) and is cleared on sign-out
 * / reload — a reload re-derives it from the vault (PIN) or keychain.
 */
let sessionSeed: string | null = null;
export function setSessionSeed(mnemonic: string | null): void {
  sessionSeed = mnemonic ? mnemonic.trim() : null;
}
export function getSessionSeed(): string | null {
  return sessionSeed;
}
export function hasSessionSeed(): boolean {
  return !!sessionSeed;
}

/** Generate a fresh wallet on-device (phrase shown to the user before commit). */
export function generateWallet(): { mnemonic: string; address: string } {
  const mnemonic = signer.newMnemonic();
  return { mnemonic, address: signer.addressFromMnemonic(mnemonic) };
}

/** The address a phrase derives to (for validation / display). */
export function addressOf(mnemonic: string): string {
  return signer.addressFromMnemonic(mnemonic);
}

/** Prove ownership of a phrase's key by signing the server's SIWE challenge. */
async function authenticate(mnemonic: string, isNew: boolean, handle?: string): Promise<WalletAuth> {
  const address = signer.addressFromMnemonic(mnemonic);
  const { message } = await api.auth.challenge(address);
  const signature = await signer.signMessage(mnemonic, message);
  return isNew ? api.auth.register(message, signature, handle) : api.auth.verify(message, signature);
}

/** Register a brand-new (client-generated) wallet — the server only gets an address + signature. */
export function registerWallet(mnemonic: string, handle?: string): Promise<WalletAuth> {
  return authenticate(mnemonic, true, handle);
}

/** Sign in / recover an existing wallet from its phrase — signature, not the phrase, is sent. */
export function signInWallet(mnemonic: string): Promise<WalletAuth> {
  return authenticate(mnemonic.trim(), false);
}

/**
 * Send USD₮ fully client-side: build the ERC-20 transfer, fetch nonce/gas, sign
 * locally, relay the pre-signed raw tx. The active network's token is passed in
 * (the caller reads it from health); the X-Gaffer-Network header routes the relay.
 */
export async function sendUsdt(mnemonic: string, token: string, to: string, amountHuman: number): Promise<{ hash: string }> {
  const from = signer.addressFromMnemonic(mnemonic);
  const data = signer.erc20TransferData(to as Address, signer.usdtBase(amountHuman));
  const prep = await api.tx.prepare(from, token, data);
  const rawTx = await signer.signTx(mnemonic, { to: token as Address, data }, prep);
  return api.tx.relay(rawTx);
}

/** The in-memory seed, re-loading from the OS keychain (desktop) if needed. Throws
 *  when the wallet is locked (web needs a PIN unlock first). */
export async function ensureSessionSeed(): Promise<string> {
  let seed = getSessionSeed();
  if (!seed && keychainAvailable) {
    seed = await keychainGet(SEED_KEY);
    if (seed) setSessionSeed(seed);
  }
  if (!seed) throw new Error("Unlock your wallet first.");
  return seed;
}

/**
 * Sign + relay a USD₮ **buy-in** — a transfer to the treasury the server then
 * verifies on-chain (client-side custody: the server never signs the fan's stake).
 * Returns the deposit tx hash to hand to the join call. Buy-ins always settle on
 * the boot network (where the pool/treasury live), regardless of the wallet's
 * active switcher network.
 */
export async function payBuyIn(opts: {
  usdtToken?: string; // boot network's USD₮ (health.usdt)
  treasury?: string | null; // health.operator
  bootNet?: string; // health.network.key — route the deposit to the boot chain
  buyInHuman: number;
}): Promise<string> {
  if (!opts.usdtToken || !opts.treasury) throw new Error("The USD₮ rail isn't ready — try again in a moment.");
  const seed = await ensureSessionSeed();
  const from = signer.addressFromMnemonic(seed);
  const data = signer.erc20TransferData(opts.treasury as Address, signer.usdtBase(opts.buyInHuman));
  const prep = await api.tx.prepare(from, opts.usdtToken, data, opts.bootNet);
  const rawTx = await signer.signTx(seed, { to: opts.usdtToken as Address, data }, prep);
  const { hash } = await api.tx.relay(rawTx, opts.bootNet);
  return hash;
}

/**
 * Pay a USD₮ buy-in for a pool/cup/league from `health`. Returns the deposit tx
 * hash to pass to the join call, or undefined for points/free entries (no deposit).
 * The server verifies the hash on-chain before recording the join.
 */
export async function payBuyInFor(
  health: Health | null,
  currency: "points" | "usdt" | undefined,
  buyInHuman: number,
): Promise<string | undefined> {
  if (currency !== "usdt" || !buyInHuman || buyInHuman <= 0) return undefined;
  return payBuyIn({
    usdtToken: health?.usdt ?? undefined,
    treasury: health?.operator ?? undefined,
    bootNet: health?.network?.key,
    buyInHuman,
  });
}
