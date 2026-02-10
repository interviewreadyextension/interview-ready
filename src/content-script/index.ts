/**
 * Content Script for LeetCode.com
 * Runs on every LeetCode page load
 * Syncs problem data from GitHub and submission data from LeetCode
 */

import { delog, delogError } from '../shared/logging';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage, addStorageListener } from '../storage/storage-service';
import { fetchUserStatus } from '../api/leetcode-graphql';
import { migrateStorageIfNeeded } from '../sync/migration';
import { updateProblems } from '../sync/problem-sync';
import { updateSubmissions } from '../sync/submission-sync';

/**
 * Update user status from LeetCode and trigger syncs if signed in
 */
async function updateUserStatus(): Promise<void> {
  let userData;
  
  try {
    userData = await fetchUserStatus();
    await setStorage(STORAGE_KEYS.userData, userData);
    delog('User status updated: ' + userData?.username);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    delogError('Failed to fetch user status: ' + message + '. Using cached data.', error);
    userData = await getStorage(STORAGE_KEYS.userData);
  }

  if (!userData?.isSignedIn) {
    delog('not signed in — will run again if some tab signs in');
    return;
  }

  // Trigger syncs in background (don't await)
  updateProblems().catch(err => delogError('Problem sync failed', err));
  updateSubmissions({ username: userData.username }).catch(err => 
    delogError('Submission sync failed', err)
  );
}

/**
 * Listen for manual refresh triggers from popup
 */
function setupChangeListener(): void {
  addStorageListener((changes) => {
    if (changes.refresh_problems) {
      delog('Manual refresh triggered from popup');
      // Bypass TTL by setting fetchTtlMs to 0
      updateProblems({ fetchTtlMs: 0 }).catch(err => 
        delogError('Manual problem refresh failed', err)
      );
    }

    if (changes.modal_opened) {
      delog('Modal opened, refreshing submissions');
      getStorage(STORAGE_KEYS.userData).then((userData) => {
        if (userData?.username) {
          updateSubmissions({ username: userData.username }).catch(err =>
            delogError('Modal submission refresh failed', err)
          );
        }
      });
    }
  });
}

/**
 * Initialize content script
 */
(async function initContentScript() {
  try {
    delog('Content script initializing...');
    await migrateStorageIfNeeded();
    await updateUserStatus();
    setupChangeListener();
    delog('Content script initialized successfully');
  } catch (error) {
    delogError('Content script initialization error', error);
  }
})();
