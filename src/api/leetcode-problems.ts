/**
 * Fetch problems from LeetCode's GraphQL API in batches.
 *
 * When run from the content script on leetcode.com, session cookies are
 * included automatically, so the `status` field on each problem will be
 * populated per-user ('ac', 'notac', or null).
 */

import type { Problem } from '../types/models';
import { delog } from '../shared/logging';

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';
const BATCH_SIZE = 200;
const THROTTLE_MS = 300; // ~3 req/sec

interface ProblemBatchResult {
  total: number;
  questions: Problem[];
}

function buildProblemQuery(skip: number, limit: number): string {
  return JSON.stringify({
    query: `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug limit: $limit skip: $skip filters: $filters) {
    total: totalNum
    questions: data {
      acRate difficulty frontendQuestionId: questionFrontendId isFavor paidOnly: isPaidOnly status title titleSlug
      topicTags { name id slug } hasSolution hasVideoSolution
    }
  }
}`,
    variables: { categorySlug: '', skip, limit, filters: {} },
  });
}

async function fetchBatch(skip: number, limit: number): Promise<ProblemBatchResult> {
  delog(`[problemBatch] fetching skip=${skip} limit=${limit}`);

  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'Referer': 'https://leetcode.com',
    },
    body: buildProblemQuery(skip, limit),
  });

  if (!response.ok) {
    delog(`[problemBatch] HTTP error: ${response.status} ${response.statusText}`);
    throw new Error(`LeetCode problems batch failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const list = result?.data?.problemsetQuestionList;

  if (!list || !Array.isArray(list.questions)) {
    delog(`[problemBatch] unexpected response shape: ${JSON.stringify(result).slice(0, 500)}`);
    throw new Error('Unexpected problemsetQuestionList response from LeetCode');
  }

  delog(`[problemBatch] got ${list.questions.length} questions, total=${list.total}`);
  // Log a sample to verify status field is populated
  if (list.questions.length > 0) {
    const q = list.questions[0];
    delog(`[problemBatch] sample: slug=${q.titleSlug} status=${q.status} difficulty=${q.difficulty} tags=${q.topicTags?.length ?? 0}`);
  }

  return { total: list.total, questions: list.questions };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchProgress {
  fetched: number;
  total: number;
  phase: string;
}

export type OnProgressCallback = (progress: FetchProgress) => void;

/**
 * Fetch all problems from LeetCode in batches of 100.
 * ~38 requests for ~3800 problems, throttled to ~2 req/sec (~20 seconds).
 *
 * When authenticated (content script), each problem has `status: 'ac' | 'notac' | null`.
 */
export async function fetchAllProblemsFromLeetCode(
  startOffset = 0,
  onProgress?: OnProgressCallback,
): Promise<{ total: number; questions: Problem[] }> {
  const questions: Problem[] = [];
  let offset = startOffset;
  let total: number | null = null;

  while (total === null || questions.length < total) {
    const batch = await fetchBatch(offset, BATCH_SIZE);

    if (total === null) {
      total = batch.total;
    }

    questions.push(...batch.questions);
    offset += BATCH_SIZE;

    delog(`Fetched problems ${questions.length}/${total}`);
    onProgress?.({ fetched: questions.length, total, phase: 'problems' });

    if (batch.questions.length === 0) break;

    // Throttle to avoid rate limiting
    if (questions.length < total) {
      await delay(THROTTLE_MS);
    }
  }

  return { total: total ?? questions.length, questions };
}

/**
 * Extract a slug → status map from problems (only includes non-null statuses).
 * Used by Mode A to store the status overlay separately from GitHub-sourced problems.
 */
export function extractStatusMap(
  questions: Problem[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of questions) {
    if (q.status) {
      map[q.titleSlug] = q.status;
    }
  }
  return map;
}
