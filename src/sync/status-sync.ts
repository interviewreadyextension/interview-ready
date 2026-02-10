/**
 * Status overlay sync (Mode A: GitHub + LeetCode status).
 *
 * Fetches all problems from LeetCode's authenticated API in batches,
 * extracts the per-user `status` field, and stores a slug→status map
 * in `problemStatusKey`. This supplements GitHub-sourced problem data
 * which has no user-specific status.
 */

import type { ProblemStatusData } from '../types/storage.types';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchAllProblemsFromLeetCode, extractStatusMap, type FetchProgress } from '../api/leetcode-problems';
import { delog } from '../shared/logging';

const STATUS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SYNC_PROGRESS_KEY = '_syncProgress_status';

export interface StatusSyncResult {
  skipped?: boolean;
  total?: number;
  acCount?: number;
  error?: string;
}

export interface StatusSyncOptions {
  /** Override TTL (set to 0 to force refresh) */
  ttlMs?: number;
}

export async function updateProblemStatuses(
  options: StatusSyncOptions = {}
): Promise<StatusSyncResult> {
  const { ttlMs = STATUS_TTL_MS } = options;
  const now = Date.now();
  const existing = await getStorage(STORAGE_KEYS.problemStatus);

  // Skip if recently fetched
  if (existing?.fetchedAt && (now - existing.fetchedAt) < ttlMs) {
    delog('Problem statuses are fresh, skipping');
    return { skipped: true };
  }

  try {
    delog('Starting problem status sync from LeetCode…');

    const reportProgress = (p: FetchProgress) => {
      chrome.storage.local.set({ [SYNC_PROGRESS_KEY]: { ...p, phase: 'status' } });
    };

    const { total, questions } = await fetchAllProblemsFromLeetCode(0, reportProgress);
    const statuses = extractStatusMap(questions);
    const acCount = Object.values(statuses).filter((s) => s === 'ac').length;

    const payload: ProblemStatusData = {
      statuses,
      fetchedAt: now,
      totalProblems: total,
      fetchedCount: questions.length,
      lastError: null,
    };

    await setStorage(STORAGE_KEYS.problemStatus, payload);
    chrome.storage.local.remove(SYNC_PROGRESS_KEY);
    delog(`Status sync completed: ${acCount} accepted out of ${total} problems`);
    return { total, acCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Keep existing cache, record error
    await setStorage(STORAGE_KEYS.problemStatus, {
      statuses: existing?.statuses ?? {},
      fetchedAt: existing?.fetchedAt ?? 0,
      totalProblems: existing?.totalProblems ?? 0,
      fetchedCount: existing?.fetchedCount ?? 0,
      lastError: message,
    });

    delog(`Status sync error: ${message}`);
    chrome.storage.local.remove(SYNC_PROGRESS_KEY);
    return { error: message };
  }
}
