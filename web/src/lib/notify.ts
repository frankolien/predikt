/**
 * Native OS notifications for the desktop app (Tauri notification plugin).
 * No-ops on the web so callers don't need to branch.
 */
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export const notifyAvailable =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let granted = false;

/** Ask for OS notification permission once (desktop only). Safe to call repeatedly. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (!notifyAvailable) return false;
  try {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    return granted;
  } catch {
    return false;
  }
}

/** Fire a native notification (no-op on web / if permission was denied). */
export async function notify(title: string, body?: string): Promise<void> {
  if (!notifyAvailable) return;
  try {
    if (!granted) granted = await isPermissionGranted();
    if (!granted) return;
    sendNotification({ title, body });
  } catch {
    /* ignore */
  }
}
