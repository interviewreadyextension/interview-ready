import { describe, test, expect, vi, afterEach } from 'vitest';
import { fetchLatestAcceptedForProblem } from '../src/api/leetcode-graphql';
import { installFetchMock, makeFetchResponder, makeSubmissionListResponse } from './helpers';

let restoreFetch: () => void;

afterEach(() => {
  restoreFetch?.();
});

// ─── fetchLatestAcceptedForProblem ─────────────────────────────────

describe('fetchLatestAcceptedForProblem', () => {

  test('returns first Accepted from mixed submissions', async () => {
    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemResults: {
        'two-sum': [
          { timestamp: '1700000300', statusDisplay: 'Wrong Answer' },
          { timestamp: '1700000200', statusDisplay: 'Accepted' },
          { timestamp: '1700000100', statusDisplay: 'Accepted' },
        ],
      },
    }));

    const result = await fetchLatestAcceptedForProblem('two-sum');
    expect(result.solved).toBe(true);
    // Should return the FIRST Accepted (most recent, since submissions are newest-first)
    expect(result.latestAcceptedTimestamp).toBe(1700000200);
  });

  test('returns unsolved when only wrong answers', async () => {
    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemResults: {
        'hard-problem': [
          { timestamp: '1700000300', statusDisplay: 'Wrong Answer' },
          { timestamp: '1700000200', statusDisplay: 'Runtime Error' },
          { timestamp: '1700000100', statusDisplay: 'Time Limit Exceeded' },
        ],
      },
    }));

    const result = await fetchLatestAcceptedForProblem('hard-problem');
    expect(result.solved).toBe(false);
    expect(result.latestAcceptedTimestamp).toBeNull();
  });

  test('paginates to find Accepted on second page', async () => {
    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemPages: {
        'paginated': [
          // Page 1: no accepted, hasNext=true
          makeSubmissionListResponse(
            [
              { timestamp: '1700000300', statusDisplay: 'Wrong Answer' },
              { timestamp: '1700000200', statusDisplay: 'Wrong Answer' },
            ],
            true,  // hasNext
            'cursor-1',
          ),
          // Page 2: has an accepted
          makeSubmissionListResponse(
            [
              { timestamp: '1700000100', statusDisplay: 'Accepted' },
            ],
            false,
            null,
          ),
        ],
      },
    }));

    const result = await fetchLatestAcceptedForProblem('paginated');
    expect(result.solved).toBe(true);
    expect(result.latestAcceptedTimestamp).toBe(1700000100);
  });

  test('returns unsolved for empty submissions', async () => {
    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemResults: {
        'empty': [],
      },
    }));

    const result = await fetchLatestAcceptedForProblem('empty');
    expect(result.solved).toBe(false);
    expect(result.latestAcceptedTimestamp).toBeNull();
  });

  test('returns unsolved for unknown slug (no data)', async () => {
    // makeFetchResponder returns empty submissions for slugs not in perProblemResults
    restoreFetch = installFetchMock(makeFetchResponder({}));

    const result = await fetchLatestAcceptedForProblem('unknown-problem');
    expect(result.solved).toBe(false);
    expect(result.latestAcceptedTimestamp).toBeNull();
  });
});

// ─── fetchAllProblemsFromLeetCode ───────────────────────────────────

import { fetchAllProblemsFromLeetCode } from '../src/api/leetcode-problems';

// Stub the delay so tests don't wait for throttling
vi.mock('../src/shared/utils', () => ({
  delay: () => Promise.resolve(),
}));

describe('fetchAllProblemsFromLeetCode', () => {

  test('returns partial results when a batch fails mid-fetch', async () => {
    let batchCalls = 0;

    restoreFetch = installFetchMock(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url;
      if (urlStr === 'https://leetcode.com/graphql/') {
        batchCalls++;

        if (batchCalls === 1) {
          // First batch: succeeds with 3 problems (total in API is 5)
          return new Response(JSON.stringify({
            data: {
              problemsetQuestionList: {
                total: 5,
                questions: [
                  {
                    titleSlug: 'two-sum', status: 'ac', difficulty: 'Easy', acRate: 50,
                    frontendQuestionId: '1', isFavor: false, isPaidOnly: false,
                    title: 'Two Sum', topicTags: [], hasSolution: false, hasVideoSolution: false
                  },
                  {
                    titleSlug: 'add-two', status: null, difficulty: 'Medium', acRate: 40,
                    frontendQuestionId: '2', isFavor: false, isPaidOnly: false,
                    title: 'Add Two', topicTags: [], hasSolution: false, hasVideoSolution: false
                  },
                  {
                    titleSlug: 'three-sum', status: 'notac', difficulty: 'Medium', acRate: 30,
                    frontendQuestionId: '3', isFavor: false, isPaidOnly: false,
                    title: 'Three Sum', topicTags: [], hasSolution: false, hasVideoSolution: false
                  },
                ],
              },
            },
          }), { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } });
        }

        // Second batch: network failure
        throw new Error('Network error');
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    });

    const result = await fetchAllProblemsFromLeetCode();

    // Partial results: first batch (3 problems) returned despite second batch failure
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0].titleSlug).toBe('two-sum');
    expect(result.error).toBe('Network error');
  });
});
