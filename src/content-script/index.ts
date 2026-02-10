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
import { updateProblems, updateProblemsFromLeetCode } from '../sync/problem-sync';
import { updateSubmissions } from '../sync/submission-sync';
import { updateProblemStatuses } from '../sync/status-sync';
import { PROBLEM_SOURCE } from '../config/feature-flags';

/** Append a diagnostic log entry to storage (kept for debug panel) */
async function logDiagnostic(event: string, detail?: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['_diagnosticLog']);
    const log: Array<{ ts: number; event: string; detail?: string }> = (result._diagnosticLog as Array<{ ts: number; event: string; detail?: string }>) ?? [];
    log.push({ ts: Date.now(), event, detail });
    // Keep last 50 entries
    if (log.length > 50) log.splice(0, log.length - 50);
    await chrome.storage.local.set({ _diagnosticLog: log });
  } catch {
    // Don't let diagnostic logging break the extension
  }
}

/**
 * Update user status from LeetCode and trigger syncs if signed in
 */
async function updateUserStatus(): Promise<void> {
  let userData;
  
  try {
    userData = await fetchUserStatus();
    await setStorage(STORAGE_KEYS.userData, userData);
    delog('User status updated: ' + userData?.username);
    await logDiagnostic('userStatus', `signed in as ${userData?.username}, premium=${userData?.isPremium}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    delogError('Failed to fetch user status: ' + message + '. Using cached data.', error);
    await logDiagnostic('userStatus:error', message);
    userData = await getStorage(STORAGE_KEYS.userData);
  }

  if (!userData?.isSignedIn) {
    delog('not signed in — will run again if some tab signs in');
    await logDiagnostic('userStatus', 'not signed in');
    return;
  }

  // Fire syncs concurrently — each uses its own progress key so they don't collide.
  if (PROBLEM_SOURCE === 'github') {
    updateProblems()
      .then(result => logDiagnostic('problemSync:done', JSON.stringify(result)))
      .catch(async err => {
        const msg = err instanceof Error ? err.message : String(err);
        delogError('Problem sync failed', err);
        await logDiagnostic('problemSync:error', msg);
      });
    updateProblemStatuses()
      .then(result => logDiagnostic('statusSync:done', JSON.stringify(result)))
      .catch(async err => {
        const msg = err instanceof Error ? err.message : String(err);
        delogError('Status sync failed', err);
        await logDiagnostic('statusSync:error', msg);
      });
  } else {
    updateProblemsFromLeetCode()
      .then(result => logDiagnostic('problemSync:done', JSON.stringify(result)))
      .catch(async err => {
        const msg = err instanceof Error ? err.message : String(err);
        delogError('Problem sync (LeetCode) failed', err);
        await logDiagnostic('problemSync:error', msg);
      });
  }

  // Submission sync also fires concurrently on init
  updateSubmissions({ username: userData.username })
    .then(result => logDiagnostic('submissionSync:done', JSON.stringify(result)))
    .catch(async err => {
      const msg = err instanceof Error ? err.message : String(err);
      delogError('Submission sync failed', err);
      await logDiagnostic('submissionSync:error', msg);
    });
}

/**
 * Listen for manual refresh triggers from popup
 */
function setupChangeListener(): void {
  addStorageListener((changes) => {
    if (changes.refresh_problems) {
      delog('Manual refresh triggered from popup');
      logDiagnostic('manualRefresh', 'triggered');
      if (PROBLEM_SOURCE === 'github') {
        updateProblems({ fetchTtlMs: 0 })
          .then(result => logDiagnostic('manualRefresh:done', JSON.stringify(result)))
          .catch(async err => {
            const msg = err instanceof Error ? err.message : String(err);
            delogError('Manual problem refresh failed', err);
            await logDiagnostic('manualRefresh:error', msg);
          });
        updateProblemStatuses({ ttlMs: 0 })
          .then(result => logDiagnostic('manualStatusRefresh:done', JSON.stringify(result)))
          .catch(async err => {
            const msg = err instanceof Error ? err.message : String(err);
            delogError('Manual status refresh failed', err);
            await logDiagnostic('manualStatusRefresh:error', msg);
          });
      } else {
        updateProblemsFromLeetCode({ fetchTtlMs: 0 })
          .then(result => logDiagnostic('manualRefresh:done', JSON.stringify(result)))
          .catch(async err => {
            const msg = err instanceof Error ? err.message : String(err);
            delogError('Manual problem refresh (LeetCode) failed', err);
            await logDiagnostic('manualRefresh:error', msg);
          });
      }
    }

    if (changes.modal_opened) {
      delog('Modal opened, refreshing submissions');
      logDiagnostic('modalRefresh', 'triggered');
      getStorage(STORAGE_KEYS.userData).then((userData) => {
        if (userData?.username) {
          updateSubmissions({ username: userData.username })
            .then(result => logDiagnostic('modalRefresh:done', JSON.stringify(result)))
            .catch(async err => {
              const msg = err instanceof Error ? err.message : String(err);
              delogError('Modal submission refresh failed', err);
              await logDiagnostic('modalRefresh:error', msg);
            });
        } else {
          logDiagnostic('modalRefresh:skip', 'no username');
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
    await logDiagnostic('init', `content script starting on ${location.href}`);
    delog('Content script initializing...');
    const migrationResult = await migrateStorageIfNeeded();
    await logDiagnostic('migration', JSON.stringify(migrationResult));
    await updateUserStatus();
    setupChangeListener();
    await logDiagnostic('init', 'content script initialized successfully');
    delog('Content script initialized successfully');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    delogError('Content script initialization error', error);
    await logDiagnostic('init:error', msg);
  }
})();
