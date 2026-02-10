/**
 * Storage key constants.
 *
 * These map friendly names to the raw string keys used in
 * `chrome.storage.local`.  The single source of truth — every
 * read/write should go through `storage-service.ts` which
 * references these keys.
 */

export const STORAGE_KEYS = {
  problems: 'problemsKey',
  submissions: 'recentSubmissionsKey',
  userData: 'userDataKey',
  version: '_storageVersion',
  refreshTrigger: 'refresh_problems',
  modalTrigger: 'modal_opened',
} as const;

/** Bump this when the storage schema changes to force a migration. */
export const STORAGE_VERSION = 1;
