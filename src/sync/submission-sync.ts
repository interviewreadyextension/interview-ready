import type { AcceptedSubmission } from '../types/models';
import type { SubmissionData } from '../types/storage.types';
import type { LeetCodeSubmission } from '../types/leetcode.types';
import { STORAGE_KEYS } from '../storage/storage-keys';
import { getStorage, setStorage } from '../storage/storage-service';
import { fetchSubmissionListPage, isAcceptedSubmission } from '../api/leetcode-graphql';
import { delog } from '../shared/logging';

const DEFAULT_SUBMISSION_LIMIT = 20;
const DEFAULT_MAX_PAGES = 200;

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

function normalizeAcceptedSubmission(submission: LeetCodeSubmission): AcceptedSubmission {
  return {
    id: String(submission.id ?? ''),
    title: submission.title,
    titleSlug: submission.titleSlug,
    timestamp: String(submission.timestamp ?? ''),
  };
}

/**
 * Fetch all accepted submissions (full sync)
 */
async function fetchAllAcceptedSubmissions(): Promise<AcceptedSubmission[]> {
  const accepted: AcceptedSubmission[] = [];
  let lastKey: string | null = null;
  let offset = 0;
  let hasNext = true;
  let pageCount = 0;

  while (hasNext) {
    if (pageCount >= DEFAULT_MAX_PAGES) {
      throw new Error('Exceeded maximum submission pages');
    }

    const page = await fetchSubmissionListPage({
      offset,
      limit: DEFAULT_SUBMISSION_LIMIT,
      lastKey,
    });

    validateChronologicalOrder(page.submissions, 'submission page');

    for (const submission of page.submissions) {
      if (isAcceptedSubmission(submission)) {
        accepted.push(normalizeAcceptedSubmission(submission));
      }
    }

    hasNext = Boolean(page.hasNext);
    lastKey = page.lastKey ?? null;
    offset += DEFAULT_SUBMISSION_LIMIT;
    pageCount += 1;
  }

  return accepted;
}

/**
 * Fetch submissions until we see a known timestamp (incremental sync)
 */
async function fetchUntilSeen(lastKnownTimestamp: string): Promise<{
  accepted: AcceptedSubmission[];
  seenKnown: boolean;
}> {
  if (!lastKnownTimestamp) {
    throw new Error('Missing last known timestamp for incremental sync');
  }

  const knownValue = parseTimestamp(lastKnownTimestamp);
  const accepted: AcceptedSubmission[] = [];
  let lastKey: string | null = null;
  let offset = 0;
  let hasNext = true;
  let seenKnown = false;
  let pageCount = 0;

  while (hasNext && !seenKnown) {
    if (pageCount >= DEFAULT_MAX_PAGES) {
      throw new Error('Exceeded maximum submission pages while searching for known timestamp');
    }

    const page = await fetchSubmissionListPage({
      offset,
      limit: DEFAULT_SUBMISSION_LIMIT,
      lastKey,
    });

    validateChronologicalOrder(page.submissions, 'submission page');

    for (const submission of page.submissions) {
      const timestampValue = parseTimestamp(submission.timestamp);
      if (timestampValue <= knownValue) {
        seenKnown = true;
        break;
      }

      if (isAcceptedSubmission(submission)) {
        accepted.push(normalizeAcceptedSubmission(submission));
      }
    }

    hasNext = Boolean(page.hasNext);
    lastKey = page.lastKey ?? null;
    offset += DEFAULT_SUBMISSION_LIMIT;
    pageCount += 1;
  }

  return { accepted, seenKnown };
}

/**
 * Merge new submissions with existing, deduplicating by id or slug+timestamp
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

/**
 * Update submissions from LeetCode (full or incremental sync)
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
    // Full sync if never synced before
    if (!existing?.firstSyncedAt) {
      const accepted = await fetchAllAcceptedSubmissions();
      validateChronologicalOrder(accepted, 'accepted submissions');

      const payload: SubmissionData = {
        data: { recentAcSubmissionList: accepted },
        firstSyncedAt: now,
        lastSyncedAt: now,
        lastSyncedTimestamp: accepted[0]?.timestamp ?? null,
        timeStamp: now,
        source: 'leetcode-submissionlist',
        lastError: null,
      };

      await setStorage(STORAGE_KEYS.submissions, payload);
      delog(`Full submission sync completed: ${accepted.length} submissions`);
      return { mode: 'full', count: accepted.length };
    }

    // Full sync if missing last synced timestamp (legacy migration)
    const lastKnownTimestamp = existing.lastSyncedTimestamp;
    if (!lastKnownTimestamp) {
      const accepted = await fetchAllAcceptedSubmissions();
      validateChronologicalOrder(accepted, 'accepted submissions');

      const payload: SubmissionData = {
        data: { recentAcSubmissionList: accepted },
        firstSyncedAt: existing.firstSyncedAt ?? now,
        lastSyncedAt: now,
        lastSyncedTimestamp: accepted[0]?.timestamp ?? null,
        timeStamp: now,
        source: existing.source ?? 'leetcode-submissionlist',
        lastError: null,
      };

      await setStorage(STORAGE_KEYS.submissions, payload);
      delog(`Full submission sync completed (legacy migration): ${accepted.length} submissions`);
      return { mode: 'full', count: accepted.length };
    }

    // Incremental sync
    const result = await fetchUntilSeen(lastKnownTimestamp);
    validateChronologicalOrder(result.accepted, 'accepted submissions');

    if (!result.seenKnown) {
      throw new Error('Incremental sync did not encounter the last known timestamp');
    }

    const merged = mergeAcceptedSubmissions(
      result.accepted,
      existing?.data?.recentAcSubmissionList ?? []
    );

    const payload: SubmissionData = {
      ...existing,
      data: { recentAcSubmissionList: merged },
      lastSyncedAt: now,
      lastSyncedTimestamp: merged[0]?.timestamp ?? lastKnownTimestamp,
      timeStamp: now,
      lastError: null,
    };

    await setStorage(STORAGE_KEYS.submissions, payload);
    delog(`Incremental submission sync completed: ${result.accepted.length} new submissions`);
    return { mode: 'incremental', count: result.accepted.length };
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
