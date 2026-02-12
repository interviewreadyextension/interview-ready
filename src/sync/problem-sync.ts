/**
 * Problem sync — fetches all LeetCode problems in batches.
 *
 * Uses the authenticated `problemsetQuestionList` GraphQL query so
 * each problem includes the per-user `status` field ('ac' | 'notac' | null).
 *
 * TTL-based de-duplication prevents redundant fetches. An in-flight
 * guard ensures only one fetch runs at a time.
 */

import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchAllProblemsFromLeetCode, type FetchProgress } from '../api/leetcode-problems';
import { delog } from '../shared/logging';

const DEFAULT_PROBLEMS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SYNC_PROGRESS_KEY = '_syncProgress_problems';

/** Prevents a second fetch from starting while one is already running. */
let _problemFetchInFlight = false;

export interface UpdateProblemsOptions {
  /** Override TTL (set to 0 to force a refresh). */
  fetchTtlMs?: number;
}

export interface UpdateProblemsResult {
  skipped: boolean;
  count?: number;
  error?: string;
  usingCache?: boolean;
}

/**
 * Fetch all problems directly from LeetCode with user-specific status.
 *
 * Stores the full problem list (including `status: 'ac'`) in `problemsKey`.
 * Progress is reported via `_syncProgress_problems` so the popup can show
 * a real-time progress bar.
 */
export async function updateProblemsFromLeetCode(
  options: UpdateProblemsOptions = {}
): Promise<UpdateProblemsResult> {
  const { fetchTtlMs = DEFAULT_PROBLEMS_TTL_MS } = options;

  // In-flight guard — skip if another fetch is already running
  if (_problemFetchInFlight) {
    delog('Problem fetch already in flight, skipping');
    return { skipped: true };
  }

  const now = Date.now();
  const existing = await getStorage(STORAGE_KEYS.problems);

  // TTL check — skip if a fetch completed recently enough
  if (existing?.fetchCompletedAt && now - existing.fetchCompletedAt < fetchTtlMs) {
    delog('Problem fetch skipped (TTL still valid)');
    return { skipped: true };
  }

  _problemFetchInFlight = true;

  // Set semaphore so the popup knows a fetch is in progress
  await setStorage(STORAGE_KEYS.problems, {
    ...existing,
    data: existing?.data ?? { problemsetQuestionList: { total: 0, questions: [] } },
    fetchStartedAt: now,
    lastAttemptAt: now,
    lastError: null,
    usingCache: false,
  });

  try {
    const reportProgress = (p: FetchProgress) => {
      chrome.storage.local.set({ [SYNC_PROGRESS_KEY]: p });
    };

    const { total, questions } = await fetchAllProblemsFromLeetCode(0, reportProgress);
    const completedAt = Date.now();

    await setStorage(STORAGE_KEYS.problems, {
      data: { problemsetQuestionList: { total, questions } },
      source: 'leetcode',
      fetchStartedAt: now,
      fetchCompletedAt: completedAt,
      lastAttemptAt: now,
      timeStamp: completedAt,
      lastError: null,
      usingCache: false,
    });

    delog(`Problem sync completed: ${questions.length} problems with status`);
    chrome.storage.local.remove(SYNC_PROGRESS_KEY);
    _problemFetchInFlight = false;
    return { skipped: false, count: questions.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Keep cached data, record the error, clear semaphore
    await setStorage(STORAGE_KEYS.problems, {
      ...existing,
      data: existing?.data ?? { problemsetQuestionList: { total: 0, questions: [] } },
      fetchStartedAt: 0,
      lastAttemptAt: now,
      lastError: message,
      timeStamp: now,
      usingCache: true,
    });

    delog(`Problem sync failed: ${message}. Using cached data.`);
    chrome.storage.local.remove(SYNC_PROGRESS_KEY);
    _problemFetchInFlight = false;
    return { skipped: false, error: message, usingCache: true };
  }
}
