import { useState, useEffect } from 'react';
import type { StorageSchema, StorageKey } from '../../types/storage.types';
import { getStorage, addStorageListener } from '../../storage/storage-service';

/**
 * React hook for reactive chrome.storage state
 * Automatically updates when storage changes
 */
export function useStorageState<K extends StorageKey>(
  key: K
): [StorageSchema[K] | undefined, boolean] {
  const [value, setValue] = useState<StorageSchema[K] | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    getStorage(key).then((result) => {
      setValue(result);
      setLoading(false);
    });

    // Listen for changes
    const listener = (changes: Partial<Record<StorageKey, { oldValue?: unknown; newValue?: unknown }>>) => {
      if (changes[key]) {
        setValue(changes[key].newValue as StorageSchema[K]);
      }
    };

    addStorageListener(listener);

    // Cleanup: Chrome doesn't provide removeListener from addStorageListener wrapper
    // We rely on Chrome's built-in cleanup when extension unloads
  }, [key]);

  return [value, loading];
}
