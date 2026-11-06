/**
 * Device storage for the demo: this device's own answers, drafts and the offline outbox.
 *
 * Safe to import from client components. Every access is wrapped in try/catch because storage can be
 * missing, full or blocked (private browsing); the app must work when it is empty.
 * Never store other experts' data here, only what this device's user typed or chose.
 */
import type { AnonymityLevel } from './types';

const PREFIX = 'gt:';

export const KEYS = {
  anonymity: `${PREFIX}anonymity`,
  draft: (token: string) => `${PREFIX}draft:${token}`,
  answer: (token: string) => `${PREFIX}answer:${token}`,
  outbox: `${PREFIX}outbox`,
} as const;

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // access itself can throw when storage is blocked
  }
}

export function readJSON<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be saved (no storage, quota, private mode). */
export function writeJSON(key: string, value: unknown): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // nothing to do
  }
}

export const readAnonymity = (): AnonymityLevel | null => {
  const v = readJSON<string>(KEYS.anonymity);
  return v === 'known_to_acaps' || v === 'pseudonymous' || v === 'anonymous' ? v : null;
};

/** An answer that could not be sent yet ("Saved on this device, will send when online"). */
export interface OutboxItem {
  id: string; // made on the device; lets the server ignore a duplicate re-send
  token: string;
  kind: 'initial' | 'revision';
  probability: number; // 0–100
  reason: string;
  savedAt: string; // ISO timestamp
}

export const readOutbox = (): OutboxItem[] => readJSON<OutboxItem[]>(KEYS.outbox) ?? [];

/** Keeps at most one pending item per link and kind: the newest wins. */
export function addToOutbox(item: OutboxItem): boolean {
  const rest = readOutbox().filter((i) => !(i.token === item.token && i.kind === item.kind));
  return writeJSON(KEYS.outbox, [...rest, item]);
}

export function removeFromOutbox(id: string): void {
  writeJSON(
    KEYS.outbox,
    readOutbox().filter((i) => i.id !== id),
  );
}
