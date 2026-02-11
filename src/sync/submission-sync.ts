import type { AcceptedSubmission } from '../types/models';
import type { SubmissionData, SubmissionCacheData } from '../types/storage.types';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchRecentAcceptedSubmissions } from '../api/leetcode-graphql';
import { delog } from '../shared/logging';
import { makeEmptyCache } from './submission-cache';

// ─── Shared helpers ─────────────────────────────────────────────────

export function validateChronologicalOrder(
  submissions: { timestamp: string }[],
  label = 'submissions'
): void {
  if (!Array.isArray(submissions)) {
    throw new Error(`Expected ${label} to be an array`);
  }

  let previous: number | null = null;
  for (let index = 0; index < submissions.length; index += 1) {
    const current = parseTimestamp(submissions[index]?.timestamp);
    if (previous !== null && current > previous) {
      throw new Error(
        `Chronology violation in ${label} at index ${index}: ${current} > ${previous}`
      );
    }
    previous = current;
  }
}

function parseTimestamp(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return parsed;
}

// ─── Incremental Sync (Layer 3) ─────────────────────────────────────

export interface IncrementalSyncResult {
  /** Whether a gap was detected (cache needs a full rescan) */
  gapDetected: boolean;
  /** Number of cache entries updated from recent submissions */
  newCount: number;
  /** The updated cache data */
  cache: SubmissionCacheData;
}

/**
 * Incremental sync — fetch the ~20 most recent accepted submissions
 * and reconcile them with the existing submission cache.
 *
 * **Gap detection**: If none of the recent submissions overlap with
 * the existing cache, we conclude submissions were missed and the
 * cache needs a full rescan. (The caller triggers Layer 2.)
 *
 * If overlap IS found, we confidently update only the new entries
 * and mark the cache as 'valid'.
 */
export async function incrementalSync(
  username: string,
  existingCache?: SubmissionCacheData,
): Promise<IncrementalSyncResult> {
  const cache = existingCache ?? makeEmptyCache();

  if (!username) {
    delog('[incremental] No username — skipping');
    return { gapDetected: false, newCount: 0, cache };
  }

  delog(`[incremental] Fetching ~20 recent accepted for ${username}…`);
  const recent = await fetchRecentAcceptedSubmissions(username, 20);
  delog(`[incremental] Got ${recent.length} recent accepted submissions`);

  if (recent.length === 0) {
    return { gapDetected: false, newCount: 0, cache };
  }

  validateChronologicalOrder(recent, 'recent accepted submissions');

  const entries = { ...cache.entries };
  const cacheIsEmpty = Object.keys(entries).length === 0;
  let overlapFound = false;
  let newCount = 0;
  const now = Date.now();

  for (const sub of recent) {
    const existing = entries[sub.titleSlug];
    const ts = Number(sub.timestamp);

    if (existing?.solved) {
      // This submission's problem was already in cache — overlap confirmed
      overlapFound = true;

      // Update if this submission is newer than what we have
      if (existing.latestAcceptedTimestamp !== null && ts > existing.latestAcceptedTimestamp) {
        entries[sub.titleSlug] = {
          solved: true,
          latestAcceptedTimestamp: ts,
          checkedAt: now,
        };
        newCount++;
      }
    } else {
      // New problem not in cache (or was marked unsolved)
      entries[sub.titleSlug] = {
        solved: true,
        latestAcceptedTimestamp: ts,
        checkedAt: now,
      };
      newCount++;
    }
  }

  // Gap detection logic:
  // - If cache was empty, no gap — we're just starting
  // - If we found overlap with existing cache entries, continuity confirmed
  // - If NO overlap and cache had entries, submissions were missed → stale
  const gapDetected = !cacheIsEmpty && !overlapFound;

  const updatedCache: SubmissionCacheData = {
    entries,
    cacheStatus: gapDetected ? 'stale' : cache.cacheStatus === 'empty' ? 'empty' : cache.cacheStatus,
    lastFullScanAt: cache.lastFullScanAt,
    lastIncrementalAt: now,
    lastError: null,
  };

  await setStorage(STORAGE_KEYS.submissionCache, updatedCache);
  delog(`[incremental] Done: ${newCount} new, gap=${gapDetected}`);

  return { gapDetected, newCount, cache: updatedCache };
}

// ─── Legacy submission accumulation ─────────────────────────────────
// Kept for backward compatibility during the migration period.
// Once the submission cache is stable, this can be removed.

export interface UpdateSubmissionsOptions {
  username: string;
}

export interface UpdateSubmissionsResult {
  skipped?: boolean;
  mode?: 'full' | 'incremental' | 'failed';
  count?: number;
  error?: string;
}

function mergeAcceptedSubmissions(
  newList: AcceptedSubmission[],
  existingList: AcceptedSubmission[]
): AcceptedSubmission[] {
  const seen = new Set<string>();
  const merged: AcceptedSubmission[] = [];

  const addItem = (item: AcceptedSubmission) => {
    const key = item.id ? `id:${item.id}` : `slug:${item.titleSlug}:ts:${item.timestamp}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  for (const item of newList) addItem(item);
  for (const item of existingList) addItem(item);

  merged.sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
  return merged;
}

/**
 * Legacy submission accumulation via `recentAcSubmissionList`.
 * @deprecated Use `incrementalSync` + submission cache instead.
 */
export async function updateSubmissions(
  options: UpdateSubmissionsOptions
): Promise<UpdateSubmissionsResult> {
  const { username } = options;

  if (!username) {
    delog('No username available; skipping submissions update.');
    return { skipped: true };
  }

  const now = Date.now();
  const existing = await getStorage(STORAGE_KEYS.submissions);

  try {
    delog(`Fetching recent accepted submissions for ${username}…`);
    const recent = await fetchRecentAcceptedSubmissions(username, 20);
    delog(`Got ${recent.length} recent accepted submissions from LeetCode`);

    validateChronologicalOrder(recent, 'recent accepted submissions');

    const existingList = existing?.data?.recentAcSubmissionList ?? [];
    const merged = mergeAcceptedSubmissions(recent, existingList);
    const newCount = merged.length - existingList.length;

    const payload: SubmissionData = {
      data: { recentAcSubmissionList: merged },
      firstSyncedAt: existing?.firstSyncedAt ?? now,
      lastSyncedAt: now,
      lastSyncedTimestamp: merged[0]?.timestamp ?? existing?.lastSyncedTimestamp ?? null,
      timeStamp: now,
      source: 'recentAcSubmissionList',
      lastError: null,
    };

    await setStorage(STORAGE_KEYS.submissions, payload);
    delog(`Submission sync completed: ${merged.length} total (${newCount} new)`);
    return { mode: newCount > 0 ? 'incremental' : 'full', count: merged.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStorage(STORAGE_KEYS.submissions, {
      ...existing,
      data: existing?.data ?? { recentAcSubmissionList: [] },
      lastError: message,
      lastSyncedAt: now,
      timeStamp: now,
    });
    delog(`Submissions sync error: ${message}`);
    return { error: message, mode: 'failed' };
  }
}
