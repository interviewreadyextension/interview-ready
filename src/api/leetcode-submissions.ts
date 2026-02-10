/**
 * Fetch the authenticated user's full submission history from LeetCode
 * via the `questionSubmissionList` GraphQL query.
 *
 * This paginates through ALL submissions (not per-problem). Each page
 * returns submissions in descending chronological order. We filter to
 * accepted-only and normalize to `AcceptedSubmission`.
 *
 * NOTE: This query requires authentication (session cookies from
 * leetcode.com). It works without a `questionSlug` — that variant
 * (per-problem) returns 400. This is the global user submission list.
 */

import type { AcceptedSubmission } from '../types/models';
import { delog } from '../shared/logging';

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';
const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_PAGES = 120;
const THROTTLE_MS = 200;

interface SubmissionListPage {
  lastKey: string | null;
  hasNext: boolean;
  submissions: RawSubmission[];
}

interface RawSubmission {
  id: string;
  title: string;
  titleSlug: string;
  status: number | null;
  statusDisplay: string;
  timestamp: string;
}

export interface FullSyncProgress {
  fetched: number;
  total: string; // 'unknown' until we finish, since API doesn't give total
  phase: 'submissions';
}

export type OnSubmissionProgressCallback = (progress: FullSyncProgress) => void;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAccepted(submission: RawSubmission): boolean {
  if (submission.statusDisplay === 'Accepted') return true;
  return submission.status === 10;
}

function normalize(submission: RawSubmission): AcceptedSubmission {
  return {
    id: String(submission.id ?? ''),
    title: submission.title ?? '',
    titleSlug: submission.titleSlug ?? '',
    timestamp: String(submission.timestamp ?? ''),
  };
}

async function fetchSubmissionPage(
  offset: number,
  limit: number,
  lastKey: string | null,
): Promise<SubmissionListPage> {
  const body = JSON.stringify({
    operationName: 'submissionList',
    query: `query submissionList($offset: Int!, $limit: Int!, $lastKey: String) {
  questionSubmissionList(offset: $offset, limit: $limit, lastKey: $lastKey) {
    lastKey
    hasNext
    submissions {
      id
      title
      titleSlug
      status
      statusDisplay
      timestamp
    }
  }
}`,
    variables: { offset, limit, lastKey },
  });

  delog(`[submissionPage] fetching offset=${offset} limit=${limit} lastKey=${lastKey}`);

  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'Referer': 'https://leetcode.com',
    },
    body,
  });

  if (!response.ok) {
    delog(`[submissionPage] HTTP error: ${response.status} ${response.statusText}`);
    throw new Error(
      `questionSubmissionList request failed: ${response.status} ${response.statusText}`,
    );
  }

  const result = await response.json();
  const list = result?.data?.questionSubmissionList;

  if (!list || !Array.isArray(list.submissions)) {
    delog(`[submissionPage] unexpected response shape: ${JSON.stringify(result).slice(0, 500)}`);
    throw new Error('Unexpected questionSubmissionList response from LeetCode');
  }

  delog(`[submissionPage] got ${list.submissions.length} submissions, hasNext=${list.hasNext}, lastKey=${list.lastKey}`);
  // Log first submission as sample
  if (list.submissions.length > 0) {
    const s = list.submissions[0];
    delog(`[submissionPage] sample: id=${s.id} slug=${s.titleSlug} status=${s.status}/${s.statusDisplay} ts=${s.timestamp}`);
  }

  return {
    lastKey: list.lastKey ?? null,
    hasNext: Boolean(list.hasNext),
    submissions: list.submissions,
  };
}

/**
 * Fetch ALL accepted submissions for the authenticated user.
 * Paginates through `questionSubmissionList` (global, not per-problem).
 *
 * Returns accepted submissions in descending timestamp order.
 */
export async function fetchAllAcceptedSubmissions(
  options: {
    limit?: number;
    onProgress?: OnSubmissionProgressCallback;
  } = {},
): Promise<AcceptedSubmission[]> {
  const { limit = DEFAULT_LIMIT, onProgress } = options;
  const accepted: AcceptedSubmission[] = [];
  let lastKey: string | null = null;
  let offset = 0;
  let hasNext = true;
  let pageCount = 0;

  while (hasNext) {
    if (pageCount >= DEFAULT_MAX_PAGES) {
      delog(`Reached max pages (${DEFAULT_MAX_PAGES}), stopping.`);
      break;
    }

    const page = await fetchSubmissionPage(offset, limit, lastKey);

    for (const sub of page.submissions) {
      if (isAccepted(sub)) {
        accepted.push(normalize(sub));
      }
    }

    pageCount++;
    hasNext = page.hasNext;
    lastKey = page.lastKey;
    offset += limit;

    delog(`Submission page ${pageCount}: ${accepted.length} accepted so far`);
    onProgress?.({
      fetched: accepted.length,
      total: hasNext ? '...' : String(accepted.length),
      phase: 'submissions',
    });

    // Throttle
    if (hasNext) {
      await delay(THROTTLE_MS);
    }
  }

  return accepted;
}

/**
 * Incremental fetch: pages through submissions until we encounter one
 * with a timestamp <= lastKnownTimestamp. Returns only the NEW accepted
 * submissions (those with timestamp > lastKnownTimestamp).
 */
export async function fetchNewAcceptedSubmissions(
  lastKnownTimestamp: string,
  options: {
    limit?: number;
    onProgress?: OnSubmissionProgressCallback;
  } = {},
): Promise<{ accepted: AcceptedSubmission[]; reachedKnown: boolean }> {
  const { limit = DEFAULT_LIMIT, onProgress } = options;
  const knownValue = Number(lastKnownTimestamp);
  if (!Number.isFinite(knownValue)) {
    throw new Error(`Invalid lastKnownTimestamp: ${lastKnownTimestamp}`);
  }

  const accepted: AcceptedSubmission[] = [];
  let lastKey: string | null = null;
  let offset = 0;
  let hasNext = true;
  let reachedKnown = false;
  let pageCount = 0;

  while (hasNext && !reachedKnown) {
    if (pageCount >= DEFAULT_MAX_PAGES) {
      delog(`Reached max pages during incremental sync, stopping.`);
      break;
    }

    const page = await fetchSubmissionPage(offset, limit, lastKey);

    for (const sub of page.submissions) {
      const ts = Number(sub.timestamp);
      if (ts <= knownValue) {
        reachedKnown = true;
        break;
      }
      if (isAccepted(sub)) {
        accepted.push(normalize(sub));
      }
    }

    pageCount++;
    hasNext = page.hasNext;
    lastKey = page.lastKey;
    offset += limit;

    delog(`Incremental page ${pageCount}: ${accepted.length} new accepted`);
    onProgress?.({
      fetched: accepted.length,
      total: '...',
      phase: 'submissions',
    });

    if (hasNext && !reachedKnown) {
      await delay(THROTTLE_MS);
    }
  }

  return { accepted, reachedKnown };
}
