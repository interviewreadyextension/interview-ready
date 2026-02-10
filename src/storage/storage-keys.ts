/**
 * Storage key constants
 */

export const STORAGE_KEYS = {
  problems: 'problemsKey',
  submissions: 'recentSubmissionsKey',
  userData: 'userDataKey',
  version: '_storageVersion',
  refreshTrigger: 'refresh_problems',
  modalTrigger: 'modal_opened',
} as const;

export const STORAGE_VERSION = 1;
