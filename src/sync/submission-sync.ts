import type { AcceptedSubmission } from '../types/models';
import type { SubmissionData } from '../types/storage.types';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchRecentAcceptedSubmissions } from '../api/leetcode-graphql';
import { delog } from '../shared/logging';

export interface UpdateSubmissionsOptions {
  username: string;
}

export interface UpdateSubmissionsResult {
  skipped?: boolean;
  mode?: 'full' | 'incremental' | 'failed';
  count?: number;
  error?: string;
}

/**
 * Validate chronological order (descending timestamps)
 */
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

// ─── Merge helper ───────────────────────────────────────────────────

/**
 * Merge new submissions with existing, deduplicating by id or slug+timestamp.
 * Result is sorted descending by timestamp.
 */
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

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Update submissions from LeetCode.
 *
 * Uses `recentAcSubmissionList` (public API, ~20 most recent accepted).
 * Merges with previously stored submissions so the list accumulates
 * over time. Each popup open / refresh adds any new submissions.
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

    // Merge with existing stored submissions (accumulate over time)
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
