import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchProblemsFromGitHub } from '../api/github-api';
import { delog } from '../shared/logging';

const DEFAULT_PROBLEMS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
