/**
 * SIWE (EIP-4361) message build + verify for client-side-custody login.
 *
 * The server builds the message (with a server-issued nonce), the client signs it
 * locally with its own key, and we recover the signer + check the nonce/domain/
 * expiry. Domain-binding (a canonical `SIWE_DOMAIN`) is defence-in-depth against
 * a signature produced for another origin being relayed here; the single-use
 * nonce is the primary replay guard. No secret is transmitted — only a signature.
 */
import { recoverMessageAddress, type Address, type Hex } from 'viem';
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { config } from '../config.js';

/** Canonical domain/uri the login message is bound to. */
export const SIWE_DOMAIN = process.env.GAFFER_SIWE_DOMAIN || 'prediktt.xyz';
export const SIWE_URI = process.env.GAFFER_SIWE_URI || `https://${SIWE_DOMAIN}`;
const STATEMENT = 'Sign in to Predikt — your self-custodial football wallet.';

/** Build the exact SIWE message the client will sign for this login/registration. */
export function buildSiweMessage(address: Address, nonce: string): string {
  return createSiweMessage({
    domain: SIWE_DOMAIN,
    address,
    statement: STATEMENT,
    uri: SIWE_URI,
    version: '1',
    chainId: config.chainId,
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 5 * 60 * 1000),
  });
}

export interface SiweFields {
  address: Address;
  nonce: string;
}

/**
 * Verify a signed SIWE message: signature recovers to the stated address, the
 * domain matches ours, and it hasn't expired. Returns the address + nonce for the
 * caller to consume, or null on any failure. (Nonce single-use is enforced by the
 * challenge store, not here.)
 */
export async function verifySiwe(message: string, signature: Hex): Promise<SiweFields | null> {
  let fields;
  try {
    fields = parseSiweMessage(message);
  } catch {
    return null;
  }
  if (!fields.address || !fields.nonce || !fields.domain) return null;
  if (fields.domain !== SIWE_DOMAIN) return null;
  if (fields.expirationTime && new Date(fields.expirationTime).getTime() < Date.now()) return null;
  let recovered: Address;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    return null;
  }
  if (recovered.toLowerCase() !== fields.address.toLowerCase()) return null;
  return { address: fields.address as Address, nonce: fields.nonce };
}
