/**
 * Content Script for LeetCode.com
 *
 * Injected on every leetcode.com page load (via manifest's content_scripts).
 *
 * Responsibilities:
 *  1. Fetch user status (signed-in / premium / username)
 *  2. Sync problem data from LeetCode's GraphQL API in batches
 *  3. Sync accepted submissions (public API, ~20 most recent, accumulated)
 *  4. Listen for manual-refresh triggers from the popup
 *
 * Communication with the popup is exclusively through chrome.storage.local
 * and chrome.storage.onChanged — no direct messaging.
 */

import { delog, delogError } from '../shared/logging';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage, addStorageListener } from '../storage/storage-service';
import { fetchUserStatus } from '../api/leetcode-graphql';
import { migrateStorageIfNeeded } from '../sync/migration';
import { updateProblemsFromLeetCode } from '../sync/problem-sync';
import { updateSubmissions } from '../sync/submission-sync';

// ─── Diagnostic logging ─────────────────────────────────────────────

/** Append a diagnostic entry to storage (read by the debug panel). */
async function logDiagnostic(event: string, detail?: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['_diagnosticLog']);
    const log: Array<{ ts: number; event: string; detail?: string }> =
      (result._diagnosticLog as Array<{ ts: number; event: string; detail?: string }>) ?? [];
    log.push({ ts: Date.now(), event, detail });
    if (log.length > 50) log.splice(0, log.length - 50); // keep last 50
    await chrome.storage.local.set({ _diagnosticLog: log });
  } catch {
    // Diagnostic logging must never break the extension
  }
}

// ─── Sync orchestration ─────────────────────────────────────────────

/**
 * Fetch user status → kick off problem + submission syncs if signed in.
 *
 * Each sync is fire-and-forget so they run concurrently; each writes
 * its own progress key so the popup can show individual progress bars.
 */
async function syncAll(): Promise<void> {
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
    delog('Not signed in — will run again when a tab signs in');
    await logDiagnostic('userStatus', 'not signed in');
    return;
  }

  // Problem sync (batched, authenticated)
  updateProblemsFromLeetCode()
    .then(result => logDiagnostic('problemSync:done', JSON.stringify(result)))
    .catch(async err => {
      const msg = err instanceof Error ? err.message : String(err);
      delogError('Problem sync failed', err);
      await logDiagnostic('problemSync:error', msg);
    });

  // Submission sync (public API, accumulated merge)
  updateSubmissions({ username: userData.username })
    .then(result => logDiagnostic('submissionSync:done', JSON.stringify(result)))
    .catch(async err => {
      const msg = err instanceof Error ? err.message : String(err);
      delogError('Submission sync failed', err);
      await logDiagnostic('submissionSync:error', msg);
    });
}

// ─── Popup triggers ─────────────────────────────────────────────────

/**
 * Listen for manual-refresh triggers written to storage by the popup.
 */
function setupChangeListener(): void {
  addStorageListener((changes) => {
    // Full refresh (problems + submissions)
    if (changes.refresh_problems) {
      delog('Manual refresh triggered from popup');
      logDiagnostic('manualRefresh', 'triggered');
      updateProblemsFromLeetCode({ fetchTtlMs: 0 })
        .then(result => logDiagnostic('manualRefresh:done', JSON.stringify(result)))
        .catch(async err => {
          const msg = err instanceof Error ? err.message : String(err);
          delogError('Manual problem refresh failed', err);
          await logDiagnostic('manualRefresh:error', msg);
        });
    }

    // Submission refresh (popup opened)
    if (changes.modal_opened) {
      delog('Popup opened, refreshing submissions');
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

// ─── Entry point ────────────────────────────────────────────────────

(async function initContentScript() {
  try {
    await logDiagnostic('init', `content script starting on ${location.href}`);
    delog('Content script initializing…');
    const migrationResult = await migrateStorageIfNeeded();
    await logDiagnostic('migration', JSON.stringify(migrationResult));
    await syncAll();
    setupChangeListener();
    await logDiagnostic('init', 'content script initialized successfully');
    delog('Content script initialized successfully');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    delogError('Content script initialization error', error);
    await logDiagnostic('init:error', msg);
  }
})();
