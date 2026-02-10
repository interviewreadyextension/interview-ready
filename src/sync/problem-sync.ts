import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchProblemsFromGitHub } from '../api/github-api';
import { fetchAllProblemsFromLeetCode, type FetchProgress } from '../api/leetcode-problems';
import { delog } from '../shared/logging';

const DEFAULT_PROBLEMS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SYNC_PROGRESS_KEY = '_syncProgress_problems';

// In-flight guard: prevents a second fetch from starting while one is running
let _problemFetchInFlight = false;

export interface UpdateProblemsOptions {
  fetchTtlMs?: number;
}

export interface UpdateProblemsResult {
  skipped: boolean;
  count?: number;
  error?: string;
  usingCache?: boolean;
}

/**
 * Update problems from GitHub with TTL-based deduplication
 */
export async function updateProblems(
  options: UpdateProblemsOptions = {}
): Promise<UpdateProblemsResult> {
  const { fetchTtlMs = DEFAULT_PROBLEMS_TTL_MS } = options;

  const now = Date.now();
  const existing = await getStorage(STORAGE_KEYS.problems);

  // Check semaphore (skip if recently fetched)
  if (existing?.fetchStartedAt && now - existing.fetchStartedAt < fetchTtlMs) {
    delog('Problems fetch skipped due to recent fetch semaphore');
    return { skipped: true };
  }

  // Set semaphore BEFORE fetch
  await setStorage(STORAGE_KEYS.problems, {
    ...existing,
    data: existing?.data ?? { problemsetQuestionList: { total: 0, questions: [] } },
    fetchStartedAt: now,
    lastAttemptAt: now,
    lastError: null,
    usingCache: false,
  });

  try {
    const payload = await fetchProblemsFromGitHub();
    const completedAt = Date.now();
    const questions = payload.data.problemsetQuestionList.questions;

    await setStorage(STORAGE_KEYS.problems, {
      ...payload,
      fetchStartedAt: now,
      fetchCompletedAt: completedAt,
      lastAttemptAt: now,
      timeStamp: completedAt,
    });

    delog(`Problems updated successfully: ${questions.length} problems`);
    return { skipped: false, count: questions.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Keep existing cached data, just log error
    await setStorage(STORAGE_KEYS.problems, {
      ...existing,
      data: existing?.data ?? { problemsetQuestionList: { total: 0, questions: [] } },
      fetchStartedAt: 0, // Clear semaphore
      lastAttemptAt: now,
      lastError: message,
      timeStamp: now,
      usingCache: true,
    });

    delog(`Problems fetch failed: ${message}. Using cached data.`);
    return { skipped: false, error: message, usingCache: true };
  }
}

/**
 * Mode B: Fetch problems directly from LeetCode with user-specific status.
 * Uses the same batched `problemsetQuestionList` query, but stores the full
 * problem data (including `status: 'ac'`) directly in `problemsKey`.
 */
export async function updateProblemsFromLeetCode(
  options: UpdateProblemsOptions = {}
): Promise<UpdateProblemsResult> {
  const { fetchTtlMs = DEFAULT_PROBLEMS_TTL_MS } = options;

  // In-flight guard — skip if another fetch is already running
  if (_problemFetchInFlight) {
    delog('Problems (LeetCode) fetch already in flight, skipping');
    return { skipped: true };
  }

  const now = Date.now();
  const existing = await getStorage(STORAGE_KEYS.problems);

  // Check semaphore (TTL-based dedup for completed fetches)
  if (existing?.fetchCompletedAt && now - existing.fetchCompletedAt < fetchTtlMs) {
    delog('Problems (LeetCode) fetch skipped due to recent completed fetch');
    return { skipped: true };
  }

  _problemFetchInFlight = true;

  // Set semaphore
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

    delog(`Problems (LeetCode) updated: ${questions.length} problems with status`);
    chrome.storage.local.remove(SYNC_PROGRESS_KEY);
    _problemFetchInFlight = false;
    return { skipped: false, count: questions.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await setStorage(STORAGE_KEYS.problems, {
      ...existing,
      data: existing?.data ?? { problemsetQuestionList: { total: 0, questions: [] } },
      fetchStartedAt: 0,
      lastAttemptAt: now,
      lastError: message,
      timeStamp: now,
      usingCache: true,
    });

    delog(`Problems (LeetCode) fetch failed: ${message}. Using cached data.`);
    chrome.storage.local.remove(SYNC_PROGRESS_KEY);
    _problemFetchInFlight = false;
    return { skipped: false, error: message, usingCache: true };
  }
}
