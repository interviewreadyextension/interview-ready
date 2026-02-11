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
import type { SubmissionCacheData } from '../types/storage.types';

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
  await logDiagnostic('fullScan:start', `status=${cache.cacheStatus}, problems=${questions.length}`);

  try {
    const result = await buildSubmissionCache(
      questions,
      TargetedStrategy,
      cache,
    );
    await logDiagnostic('fullScan:done', `entries=${Object.keys(result.entries).length}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    delogError('Full scan failed', err);
    await logDiagnostic('fullScan:error', msg);
  }
}

// ─── Sync orchestration ─────────────────────────────────────────────

/**
 * Main sync flow — runs on every leetcode.com page load.
 *
 * 1. Fetch user status
 * 2. Layer 1 (problems) + Layer 3 (incremental) run concurrently
 * 3. If Layer 3 detects a gap or cache is empty → Layer 2 (full scan)
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

  const existingCache = (await getStorage(STORAGE_KEYS.submissionCache)) ?? makeEmptyCache();

  // Layer 1 (problems) and Layer 3 (incremental) run concurrently
  const [, incrementalResult] = await Promise.all([
    updateProblemsFromLeetCode()
      .then(r => { logDiagnostic('problemSync:done', JSON.stringify(r)); return r; })
      .catch(async err => {
        const msg = err instanceof Error ? err.message : String(err);
        delogError('Problem sync failed', err);
        await logDiagnostic('problemSync:error', msg);
        return null;
      }),

    incrementalSync(userData.username, existingCache)
      .then(r => { logDiagnostic('incrementalSync:done', JSON.stringify({ gap: r.gapDetected, new: r.newCount })); return r; })
      .catch(async err => {
        const msg = err instanceof Error ? err.message : String(err);
        delogError('Incremental sync failed', err);
        await logDiagnostic('incrementalSync:error', msg);
        return null;
      }),
  ]);

  // Layer 2: full scan if needed (requires Layer 1 to have completed)
  const latestCache = incrementalResult?.cache ?? existingCache;
  const needsFullScan = incrementalResult?.gapDetected
    || latestCache.cacheStatus === 'empty'
    || latestCache.cacheStatus === 'stale';

  if (needsFullScan) {
    await runFullScanIfNeeded(latestCache);
  }
}

// ─── Popup triggers ─────────────────────────────────────────────────

/**
 * Listen for manual-refresh triggers written to storage by the popup.
 */
function setupChangeListener(): void {
  addStorageListener((changes) => {
    // Full refresh: re-run all three layers
    if (changes.refresh_problems) {
      delog('Manual refresh triggered from popup');
      logDiagnostic('manualRefresh', 'triggered');

      (async () => {
        try {
          // Force-refresh problems (TTL=0)
          await updateProblemsFromLeetCode({ fetchTtlMs: 0 });
          await logDiagnostic('manualRefresh:problems', 'done');

          // Force full rescan of submission cache
          const cache = (await getStorage(STORAGE_KEYS.submissionCache)) ?? makeEmptyCache();
          // Mark cache stale to force a complete rescan
          const staleCache: SubmissionCacheData = { ...cache, cacheStatus: 'stale' };
          await runFullScanIfNeeded(staleCache);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          delogError('Manual refresh failed', err);
          await logDiagnostic('manualRefresh:error', msg);
        }
      })();
    }

    // Popup opened → quick incremental sync
    if (changes.modal_opened) {
      delog('Popup opened, running incremental sync');
      logDiagnostic('modalRefresh', 'triggered');

      (async () => {
        try {
          const userData = await getStorage(STORAGE_KEYS.userData);
          if (!userData?.username) {
            await logDiagnostic('modalRefresh:skip', 'no username');
            return;
          }

          const cache = (await getStorage(STORAGE_KEYS.submissionCache)) ?? makeEmptyCache();
          const result = await incrementalSync(userData.username, cache);
          await logDiagnostic('modalRefresh:done', JSON.stringify({ gap: result.gapDetected, new: result.newCount }));

          // If gap detected, trigger full scan
          if (result.gapDetected) {
            await runFullScanIfNeeded(result.cache);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          delogError('Modal refresh failed', err);
          await logDiagnostic('modalRefresh:error', msg);
        }
      })();
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
