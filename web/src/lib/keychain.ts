/**
 * OS-keychain-backed secret storage for the desktop app — macOS Keychain,
 * Windows Credential Manager, or libsecret — via Tauri commands. The wallet seed
 * lives here on desktop instead of a PIN-encrypted blob in localStorage, so it's
 * protected by the OS and never touches a server. On the web these are no-ops so
 * callers fall back to the browser vault.
 */
import { invoke } from "@tauri-apps/api/core";

export const keychainAvailable =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The keychain entry name for the wallet recovery phrase. */
export const SEED_KEY = "wallet-seed";

export async function keychainSet(key: string, value: string): Promise<void> {
  if (!keychainAvailable) throw new Error("keychain unavailable");
  await invoke("keychain_set", { key, value });
}

export async function keychainGet(key: string): Promise<string | null> {
  if (!keychainAvailable) return null;
  try {
    return await invoke<string | null>("keychain_get", { key });
  } catch {
    return null;
  }
}

export async function keychainDelete(key: string): Promise<void> {
  if (!keychainAvailable) return;
  try {
    await invoke("keychain_delete", { key });
  } catch {
    /* ignore */
  }
}
