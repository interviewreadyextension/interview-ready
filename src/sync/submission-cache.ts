/**
 * Submission Cache Orchestrator (Layer 2)
 *
 * Builds the per-problem submission cache by calling
 * `fetchLatestAcceptedForProblem()` for each problem that needs
 * scanning. Writes progress to storage so the popup can show a
 * real-time progress bar.
 *
 * Key design decisions:
 *   - Sequential requests with 75ms throttle (~13 req/sec)
 *   - Intermediate storage writes every N problems (survives tab close)
 *   - AbortSignal support for cancellation
 *   - Strategy pattern determines which problems to query vs. skip
 */

import type { Problem } from '../types/models';
import type { SubmissionCacheData } from '../types/storage.types';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { setStorage } from '../storage/storage-service';
import { fetchLatestAcceptedForProblem } from '../api/leetcode-graphql';
import type { ScanStrategy } from './scan-strategy';
import { delay } from '../shared/utils';
import { delog, delogError } from '../shared/logging';

const THROTTLE_MS = 75;
const CHECKPOINT_INTERVAL = 10; // write to storage every N problems
const SYNC_PROGRESS_KEY = '_syncProgress_submissions';

// ─── Progress reporting ─────────────────────────────────────────────

export interface ScanProgress {
  fetched: number;
  total: number;
  phase: string;
}

export type OnScanProgress = (progress: ScanProgress) => void;

// ─── Empty cache factory ────────────────────────────────────────────

export function makeEmptyCache(): SubmissionCacheData {
  return {
    entries: {},
    cacheStatus: 'empty',
    lastFullScanAt: null,
    lastIncrementalAt: null,
    lastError: null,
  };
}

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Build (or extend) the submission cache by scanning problems that
 * are not yet cached.
 *
 * The `strategy` object decides which problems get an API call
 * vs. which can be marked unsolved without a call.
 *
 * Progress is reported both via `onProgress` callback and by writing
 * `_syncProgress_submissions` to storage (for the popup progress bar).
 *
 * Returns the updated cache data.
 */
export async function buildSubmissionCache(
  problems: Problem[],
  strategy: ScanStrategy,
  existingCache: SubmissionCacheData,
  onProgress?: OnScanProgress,
  signal?: AbortSignal,
): Promise<SubmissionCacheData> {
  const entries = { ...existingCache.entries };
  const { toQuery, toMarkUnsolved } = strategy.partition(problems, entries);

  if (toQuery.length === 0 && toMarkUnsolved.length === 0) {
    delog('[cache] Nothing to scan — cache already covers all problems');
    return {
      ...existingCache,
      cacheStatus: 'valid',
      lastFullScanAt: Date.now(),
      lastError: null,
    };
  }

  delog(`[cache] Scan starting: ${toQuery.length} to query, ${toMarkUnsolved.length} to mark unsolved (strategy: ${strategy.name})`);

  // Mark unsolved problems immediately (no API call needed)
  const now = Date.now();
  for (const p of toMarkUnsolved) {
    entries[p.titleSlug] = {
      solved: false,
      latestAcceptedTimestamp: null,
      checkedAt: now,
    };
  }

  // Progress tracks only API calls (toQuery), not the instant toMarkUnsolved
  let fetched = 0;
  const totalToQuery = toQuery.length;

  const reportProgress = (phase: string) => {
    const progress: ScanProgress = { fetched, total: totalToQuery, phase };
    onProgress?.(progress);
    chrome.storage.local.set({ [SYNC_PROGRESS_KEY]: progress });
  };

  if (totalToQuery === 0) {
    // Only had unsolved to mark — nothing to query
    delog('[cache] Only unsolved entries to mark — no API calls needed');
    const completedCache: SubmissionCacheData = {
      entries,
      cacheStatus: 'valid',
      lastFullScanAt: Date.now(),
      lastIncrementalAt: existingCache.lastIncrementalAt,
      lastError: null,
    };
    await setStorage(STORAGE_KEYS.submissionCache, completedCache);
    return completedCache;
  }

  reportProgress('scanning');

  // Write the initial state as 'building'
  const cacheInProgress: SubmissionCacheData = {
    entries,
    cacheStatus: 'building',
    lastFullScanAt: existingCache.lastFullScanAt,
    lastIncrementalAt: existingCache.lastIncrementalAt,
    lastError: null,
  };
  await setStorage(STORAGE_KEYS.submissionCache, cacheInProgress);

  // Sequential scan with throttling
  for (let i = 0; i < toQuery.length; i++) {
    if (signal?.aborted) {
      delog('[cache] Scan aborted');
      break;
    }

    const problem = toQuery[i];

    try {
      const result = await fetchLatestAcceptedForProblem(problem.titleSlug);
      entries[problem.titleSlug] = {
        solved: result.solved,
        latestAcceptedTimestamp: result.latestAcceptedTimestamp,
        checkedAt: Date.now(),
      };
    } catch (err) {
      // Log but don't abort — skip this problem and continue
      delogError(`[cache] Failed to scan ${problem.titleSlug}`, err);
      entries[problem.titleSlug] = {
        solved: false,
        latestAcceptedTimestamp: null,
        checkedAt: Date.now(),
      };
    }

    fetched++;
    reportProgress('scanning');

    // Checkpoint: write intermediate cache every N problems
    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      await setStorage(STORAGE_KEYS.submissionCache, {
        ...cacheInProgress,
        entries: { ...entries },
      });
      delog(`[cache] Checkpoint at ${fetched}/${totalToQuery}`);
    }

    // Throttle between API calls (skip after last item)
    if (i < toQuery.length - 1) {
      await delay(THROTTLE_MS);
    }
  }

  // Final write
  const completedCache: SubmissionCacheData = {
    entries,
    cacheStatus: signal?.aborted ? existingCache.cacheStatus : 'valid',
    lastFullScanAt: signal?.aborted ? existingCache.lastFullScanAt : Date.now(),
    lastIncrementalAt: existingCache.lastIncrementalAt,
    lastError: null,
  };

  await setStorage(STORAGE_KEYS.submissionCache, completedCache);
  chrome.storage.local.remove(SYNC_PROGRESS_KEY);

  delog(`[cache] Scan complete: ${fetched}/${totalToQuery} queried, ${toMarkUnsolved.length} marked unsolved`);
  return completedCache;
}
