/**
 * Storage migration — clears stale caches when the schema version
 * changes.  Runs once at content-script init before any sync begins.
 *
 * Bump `STORAGE_VERSION` in `storage-keys.ts` whenever the storage
 * schema changes in a way that old cached data would be invalid.
 */

import { STORAGE_KEYS, STORAGE_VERSION } from '../storage/storage-keys';
import { getStorage, setStorage, removeStorage } from '../storage/storage-service';
import { delog } from '../shared/logging';

/**
 * Migrate storage if needed (clear pre-migration caches)
 */
export async function migrateStorageIfNeeded(): Promise<{
  migrated: boolean;
  from?: number | null;
  to?: number;
}> {
  const currentVersion = await getStorage(STORAGE_KEYS.version);

  if (currentVersion === STORAGE_VERSION) {
    return { migrated: false };
  }

  delog(
    `Storage migration: clearing pre-migration caches (version ${currentVersion ?? 'none'} → ${STORAGE_VERSION})`
  );

  await removeStorage([STORAGE_KEYS.problems, STORAGE_KEYS.submissions, STORAGE_KEYS.submissionCache]);
  await setStorage(STORAGE_KEYS.version, STORAGE_VERSION);

  return { migrated: true, from: currentVersion ?? null, to: STORAGE_VERSION };
}
