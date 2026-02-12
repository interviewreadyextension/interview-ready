import { describe, test, expect, afterEach } from 'vitest';
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
