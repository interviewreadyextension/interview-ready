/**
 * Type-safe wrappers around `chrome.storage.local`.
 *
 * Every storage read/write in the extension should go through these
 * helpers so that key names and value shapes are enforced by
 * TypeScript at compile time.
 *
 * Also exposes `addStorageListener` for reactive updates — the popup
 * uses it to re-render when the content script writes new data.
 */

import type { StorageSchema, StorageKey } from '../types/storage.types';

export async function getStorage<K extends StorageKey>(
  key: K
): Promise<StorageSchema[K] | undefined> {
  const result = await chrome.storage.local.get([key]);
  return result[key] as StorageSchema[K] | undefined;
}

export async function getMultipleStorage<K extends StorageKey>(
  keys: K[]
): Promise<Partial<Pick<StorageSchema, K>>> {
  const result = await chrome.storage.local.get(keys);
  return result as Partial<Pick<StorageSchema, K>>;
}

export async function setStorage<K extends StorageKey>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function updateStorage<K extends StorageKey>(
  key: K,
  updater: (current: StorageSchema[K] | undefined) => StorageSchema[K]
): Promise<void> {
  const current = await getStorage(key);
  const updated = updater(current);
  await setStorage(key, updated);
}

export async function removeStorage(keys: StorageKey | StorageKey[]): Promise<void> {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  await chrome.storage.local.remove(keyArray);
}

/**
 * Listen for storage changes
 */
export function addStorageListener(
  callback: (changes: {
    [K in StorageKey]?: { oldValue?: StorageSchema[K]; newValue?: StorageSchema[K] };
  }) => void
): void {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      callback(changes);
    }
  });
}
