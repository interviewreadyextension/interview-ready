/**
 * Content Script for LeetCode.com
 *
 * Injected on every leetcode.com page load (via manifest's content_scripts).
 *
 * Three-layer sync architecture:
 *   Layer 1 — Problem catalog: batch-fetch all problems with per-user `status`
 *   Layer 2 — Submission cache: per-problem `questionSubmissionList` scan
 *             for actual timestamps (runs when cache is empty/stale)
 *   Layer 3 — Incremental sync: fast ~20 recent-accepted check with gap
 *             detection (runs every page load / popup open)
 *
 * Communication with the popup is exclusively through chrome.storage.local
 * and chrome.storage.onChanged — no direct messaging.
 *
 * Cross-tab coordination: uses a storage-based sync lock so only one tab
 * runs the sync at a time. Other tabs yield if a fresh lock exists.
 */

import { delog, delogError } from '../shared/logging';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage, addStorageListener } from '../storage/storage-service';
import { fetchUserStatus } from '../api/leetcode-graphql';
import { migrateStorageIfNeeded } from '../sync/migration';
import { updateProblemsFromLeetCode } from '../sync/problem-sync';
import { incrementalSync } from '../sync/submission-sync';
import { buildSubmissionCache, makeEmptyCache } from '../sync/submission-cache';
import { TargetedStrategy } from '../sync/scan-strategy';
import { acquireSyncLock, heartbeatSyncLock, releaseSyncLock } from '../sync/sync-lock';
import type { SubmissionCacheData } from '../types/storage.types';

/** Unique ID for this content script instance (one per tab). */
const OWNER_ID = crypto.randomUUID();

// ─── Layer 2 trigger ────────────────────────────────────────────────

/**
 * Run the full per-problem submission scan (Layer 2) if needed.
 *
 * Requires the problem list from Layer 1 to already be in storage.
 * Uses the TargetedStrategy by default (only queries status==='ac' problems).
 */
async function runFullScanIfNeeded(cache: SubmissionCacheData): Promise<void> {
  const needsScan = cache.cacheStatus === 'empty'
    || cache.cacheStatus === 'stale'
    || cache.cacheStatus === 'building';

  if (!needsScan) {
    delog('[orchestrator] Cache is valid — skipping full scan');
    return;
  }

  const problemData = await getStorage(STORAGE_KEYS.problems);
  const questions = problemData?.data?.problemsetQuestionList?.questions;

  if (!questions?.length) {
    delog('[orchestrator] No problems in storage — cannot run full scan');
    return;
  }

  delog(`[orchestrator] Starting full scan (status=${cache.cacheStatus}, ${questions.length} problems)`);

  try {
    await buildSubmissionCache(questions, TargetedStrategy, cache);
  } catch (err) {
    delogError('Full scan failed', err);
  }
}

// ─── Sync orchestration ─────────────────────────────────────────────

/**
 * Main sync flow — runs on every leetcode.com page load.
 *
 * Acquires a cross-tab sync lock so only one tab syncs at a time.
 * The lock uses a heartbeat pattern — if the holding tab closes,
 * another tab can take over after 60s (derived from API retry timing).
 *
 * 1. Acquire sync lock
 * 2. Fetch user status
 * 3. Layer 1 (problems) + Layer 3 (incremental) run concurrently
 * 4. If Layer 3 detects a gap or cache is empty → Layer 2 (full scan)
 * 5. Release sync lock
 */
async function syncAll(): Promise<void> {
  // Acquire the cross-tab sync lock
  const acquired = await acquireSyncLock(OWNER_ID);
  if (!acquired) {
    delog('[orchestrator] Another tab is syncing — yielding');
    return;
  }

  try {
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
      delog('Not signed in — will run again when a tab signs in');
      return;
    }

    // Heartbeat: still alive after user status fetch
    await heartbeatSyncLock(OWNER_ID);

    // Check if the popup requested a forced refresh
    const refreshTime = await getStorage(STORAGE_KEYS.refreshTrigger) as number | undefined;
    const existingProblems = await getStorage(STORAGE_KEYS.problems);
    const forceRefresh = !!(refreshTime &&
      (!existingProblems?.fetchCompletedAt || refreshTime > existingProblems.fetchCompletedAt));

    if (forceRefresh) {
      delog('Pending manual refresh detected — bypassing TTL');
    }

    const existingCache = (await getStorage(STORAGE_KEYS.submissionCache)) ?? makeEmptyCache();

    // Layer 1 (problems) and Layer 3 (incremental) run concurrently
    const [, incrementalResult] = await Promise.all([
      updateProblemsFromLeetCode(forceRefresh ? { fetchTtlMs: 0 } : {})
        .catch(err => {
          delogError('Problem sync failed', err);
          return null;
        }),

      incrementalSync(userData.username, existingCache)
        .catch(err => {
          delogError('Incremental sync failed', err);
          return null;
        }),
    ]);

    // Heartbeat: still alive after Layer 1 + Layer 3
    await heartbeatSyncLock(OWNER_ID);

    // If forced refresh, clear the trigger and re-scan all ac problems.
    // Keep existing entries (popup still shows data) but set refreshRequestedAt
    // so the strategy treats entries checked before the refresh as stale.
    if (forceRefresh) {
      await chrome.storage.local.remove(STORAGE_KEYS.refreshTrigger);
      await runFullScanIfNeeded({
        ...existingCache,
        cacheStatus: 'stale',
        refreshRequestedAt: Date.now(),
      });
    } else {
      // Layer 2: full scan if needed (requires Layer 1 to have completed)
      const latestCache = incrementalResult?.cache ?? existingCache;
      const needsFullScan = incrementalResult?.gapDetected
        || latestCache.cacheStatus === 'empty'
        || latestCache.cacheStatus === 'stale'
        || latestCache.cacheStatus === 'building';

      if (needsFullScan) {
        await runFullScanIfNeeded(latestCache);
      }
    }
  } finally {
    // Always release the lock, even if sync threw
    await releaseSyncLock(OWNER_ID);
  }
}

// ─── Popup triggers ─────────────────────────────────────────────────

/**
 * Listen for manual-refresh triggers written to storage by the popup.
 * These also go through the sync lock — if another tab is already
 * syncing, the trigger will be picked up by that tab's next run.
 */
function setupChangeListener(): void {
  addStorageListener((changes) => {
    // Full refresh: re-run all three layers
    if (changes.refresh_problems) {
      delog('Manual refresh triggered from popup');

      (async () => {
        const acquired = await acquireSyncLock(OWNER_ID);
        if (!acquired) {
          delog('[orchestrator] Another tab is syncing — manual refresh deferred');
          return;
        }

        try {
          await updateProblemsFromLeetCode({ fetchTtlMs: 0 });
          await heartbeatSyncLock(OWNER_ID);

          const cache = (await getStorage(STORAGE_KEYS.submissionCache)) ?? makeEmptyCache();
          const staleCache: SubmissionCacheData = { ...cache, cacheStatus: 'stale' };
          await runFullScanIfNeeded(staleCache);
        } catch (err) {
          delogError('Manual refresh failed', err);
        } finally {
          await releaseSyncLock(OWNER_ID);
        }
      })();
    }

    // Popup opened → quick incremental sync (lightweight, no lock needed)
    if (changes.modal_opened) {
      delog('Popup opened, running incremental sync');

      (async () => {
        try {
          const userData = await getStorage(STORAGE_KEYS.userData);
          if (!userData?.username) return;

          const cache = (await getStorage(STORAGE_KEYS.submissionCache)) ?? makeEmptyCache();
          const result = await incrementalSync(userData.username, cache);

          if (result.gapDetected) {
            const acquired = await acquireSyncLock(OWNER_ID);
            if (!acquired) {
              delog('[orchestrator] Another tab is syncing — gap scan deferred');
              return;
            }
            try {
              await runFullScanIfNeeded(result.cache);
            } finally {
              await releaseSyncLock(OWNER_ID);
            }
          }
        } catch (err) {
          delogError('Modal refresh failed', err);
        }
      })();
    }
  });
}

// ─── Entry point ────────────────────────────────────────────────────

(async function initContentScript() {
  try {
    delog('Content script initializing…');
    await migrateStorageIfNeeded();
    await syncAll();
    setupChangeListener();
    delog('Content script initialized successfully');
  } catch (error) {
    delogError('Content script initialization error', error);
  }
})();
