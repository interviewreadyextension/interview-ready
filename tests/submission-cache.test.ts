import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSubmissionCache, makeEmptyCache, type ScanProgress } from '../src/sync/submission-cache';
import { TargetedStrategy } from '../src/sync/scan-strategy';
import {
  installChromeStub,
  installFetchMock,
  makeFetchResponder,
  makeCacheData,
  makeCacheEntry,
  q,
} from './helpers';

// Stub the delay so tests don't wait 300ms per problem
vi.mock('../src/shared/utils', () => ({
  delay: () => Promise.resolve(),
}));

let restoreFetch: () => void;

beforeEach(() => {
  installChromeStub({ localData: {} });
});

afterEach(() => {
  restoreFetch?.();
});

// ─── buildSubmissionCache ──────────────────────────────────────────

describe('buildSubmissionCache', () => {

  test('full scan with mixed results: solved, unsolved, wrong-answer-only', async () => {
    // 3 problems: one accepted, one notac, one ac but API returns only WrongAnswer
    const problems = [
      q({ titleSlug: 'has-accepted', status: 'ac' }),
      q({ titleSlug: 'only-wrong', status: 'ac' }),
      q({ titleSlug: 'never-accepted', status: 'notac' }),
    ];

    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemResults: {
        'has-accepted': [
          { timestamp: '1700000000', statusDisplay: 'Wrong Answer' },
          { timestamp: '1699000000', statusDisplay: 'Accepted' },
        ],
        'only-wrong': [
          { timestamp: '1700000000', statusDisplay: 'Wrong Answer' },
          { timestamp: '1699000000', statusDisplay: 'Runtime Error' },
        ],
      },
    }));

    const cache = makeEmptyCache();
    const result = await buildSubmissionCache(problems, TargetedStrategy, cache);

    // has-accepted: found Accepted at ts=1699000000
    expect(result.entries['has-accepted'].solved).toBe(true);
    expect(result.entries['has-accepted'].latestAcceptedTimestamp).toBe(1699000000);

    // only-wrong: no Accepted found → unsolved
    expect(result.entries['only-wrong'].solved).toBe(false);
    expect(result.entries['only-wrong'].latestAcceptedTimestamp).toBeNull();

    // never-accepted: marked unsolved by strategy (no API call)
    expect(result.entries['never-accepted'].solved).toBe(false);
    expect(result.entries['never-accepted'].latestAcceptedTimestamp).toBeNull();

    expect(result.cacheStatus).toBe('valid');
    expect(result.lastFullScanAt).toBeGreaterThan(0);
  });

  test('progress only counts API calls, not toMarkUnsolved', async () => {
    // 2 ac (needs API), 3 notac (instant mark)
    const problems = [
      q({ titleSlug: 'ac-1', status: 'ac' }),
      q({ titleSlug: 'ac-2', status: 'ac' }),
      q({ titleSlug: 'notac-1', status: 'notac' }),
      q({ titleSlug: 'notac-2', status: 'notac' }),
      q({ titleSlug: 'notac-3', status: 'notac' }),
    ];

    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemResults: {
        'ac-1': [{ timestamp: '1000', statusDisplay: 'Accepted' }],
        'ac-2': [{ timestamp: '2000', statusDisplay: 'Accepted' }],
      },
    }));

    const progressCalls: ScanProgress[] = [];
    const cache = makeEmptyCache();
    await buildSubmissionCache(problems, TargetedStrategy, cache, (p) => {
      progressCalls.push({ ...p });
    });

    // Total should be 2 (only API calls), not 5
    for (const p of progressCalls) {
      expect(p.total).toBe(2);
    }

    // fetched should go 0 → 1 → 2 monotonically
    const fetchedValues = progressCalls.map(p => p.fetched);
    expect(fetchedValues[0]).toBe(0);  // initial report
    // Check monotonic increase
    for (let i = 1; i < fetchedValues.length; i++) {
      expect(fetchedValues[i]).toBeGreaterThanOrEqual(fetchedValues[i - 1]);
    }
    // Final value should be 2
    expect(fetchedValues[fetchedValues.length - 1]).toBe(2);
  });

  test('per-problem error does not abort scan', async () => {
    const problems = [
      q({ titleSlug: 'will-fail', status: 'ac' }),
      q({ titleSlug: 'will-succeed', status: 'ac' }),
    ];

    // Make the first slug throw, second succeeds
    let callCount = 0;
    restoreFetch = installFetchMock(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url;
      if (urlStr === 'https://leetcode.com/graphql/') {
        const body = JSON.parse(options?.body as string ?? '{}');
        if (body.operationName === 'submissionList') {
          callCount++;
          const slug = body.variables?.questionSlug;
          if (slug === 'will-fail') {
            throw new Error('Network error');
          }
          return new Response(JSON.stringify({
            data: {
              questionSubmissionList: {
                lastKey: null,
                hasNext: false,
                submissions: [{ timestamp: '5000', statusDisplay: 'Accepted' }],
              },
            },
          }), { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } });
        }
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    });

    const cache = makeEmptyCache();
    const result = await buildSubmissionCache(problems, TargetedStrategy, cache);

    // Both problems should have been attempted
    expect(callCount).toBe(2);

    // Failed one is marked unsolved
    expect(result.entries['will-fail'].solved).toBe(false);
    expect(result.entries['will-fail'].latestAcceptedTimestamp).toBeNull();

    // Successful one has correct data
    expect(result.entries['will-succeed'].solved).toBe(true);
    expect(result.entries['will-succeed'].latestAcceptedTimestamp).toBe(5000);

    // Cache still marked valid (scan completed)
    expect(result.cacheStatus).toBe('valid');
  });

  test('already-cached entries are skipped (no extra API calls)', async () => {
    const problems = [
      q({ titleSlug: 'cached', status: 'ac' }),
      q({ titleSlug: 'not-cached', status: 'ac' }),
    ];

    let apiCalls = 0;
    restoreFetch = installFetchMock(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url;
      if (urlStr === 'https://leetcode.com/graphql/') {
        const body = JSON.parse(options?.body as string ?? '{}');
        if (body.operationName === 'submissionList') {
          apiCalls++;
          return new Response(JSON.stringify({
            data: {
              questionSubmissionList: {
                lastKey: null,
                hasNext: false,
                submissions: [{ timestamp: '9000', statusDisplay: 'Accepted' }],
              },
            },
          }), { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } });
        }
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    });

    const existingCache = makeCacheData({
      cached: makeCacheEntry({ solved: true, latestAcceptedTimestamp: 100 }),
    }, { cacheStatus: 'stale' });

    const result = await buildSubmissionCache(problems, TargetedStrategy, existingCache);

    // Only 1 API call (for 'not-cached'), not 2
    expect(apiCalls).toBe(1);
    // Existing entry preserved
    expect(result.entries['cached'].latestAcceptedTimestamp).toBe(100);
    // New entry has correct data
    expect(result.entries['not-cached'].solved).toBe(true);
    expect(result.entries['not-cached'].latestAcceptedTimestamp).toBe(9000);
  });

  test('only toMarkUnsolved with no toQuery: no API calls, cache is valid', async () => {
    const problems = [
      q({ titleSlug: 'wrong-a', status: 'notac' }),
      q({ titleSlug: 'wrong-b', status: 'notac' }),
    ];

    let apiCalls = 0;
    restoreFetch = installFetchMock(async () => {
      apiCalls++;
      throw new Error('Should not be called');
    });

    const cache = makeEmptyCache();
    const result = await buildSubmissionCache(problems, TargetedStrategy, cache);

    expect(apiCalls).toBe(0);
    expect(result.entries['wrong-a'].solved).toBe(false);
    expect(result.entries['wrong-b'].solved).toBe(false);
    expect(result.cacheStatus).toBe('valid');
  });

  test('cache clearing + rescan: wiped entries get re-queried', async () => {
    // Simulate the reload flow: cache had entries, gets cleared, then rescan
    const problems = [
      q({ titleSlug: 'two-sum', status: 'ac' }),
      q({ titleSlug: 'add-two', status: 'notac' }),
    ];

    restoreFetch = installFetchMock(makeFetchResponder({
      perProblemResults: {
        'two-sum': [{ timestamp: '5000', statusDisplay: 'Accepted' }],
      },
    }));

    // Start with a wiped (empty) cache — simulating what makeEmptyCache() returns
    // after the reload button clears everything
    const wipedCache = makeEmptyCache();
    const result = await buildSubmissionCache(problems, TargetedStrategy, wipedCache);

    // After rescan, entries should be re-populated
    expect(result.entries['two-sum'].solved).toBe(true);
    expect(result.entries['two-sum'].latestAcceptedTimestamp).toBe(5000);
    expect(result.entries['add-two'].solved).toBe(false);
    expect(result.cacheStatus).toBe('valid');
  });

  test('nothing to scan returns valid immediately', async () => {
    // All problems already cached
    const problems = [
      q({ titleSlug: 'done', status: 'ac' }),
    ];

    const existingCache = makeCacheData({
      done: makeCacheEntry({ solved: true, latestAcceptedTimestamp: 100 }),
    }, { cacheStatus: 'stale' });

    // Should not make any fetch calls
    restoreFetch = installFetchMock(async () => {
      throw new Error('Should not be called');
    });

    const result = await buildSubmissionCache(problems, TargetedStrategy, existingCache);
    expect(result.cacheStatus).toBe('valid');
    expect(result.lastFullScanAt).toBeGreaterThan(0);
  });
});
