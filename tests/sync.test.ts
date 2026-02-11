import { describe, test, expect, vi } from 'vitest';
import { migrateStorageIfNeeded } from '../src/sync/migration';
import { updateSubmissions, validateChronologicalOrder, incrementalSync } from '../src/sync/submission-sync';
import {
  installChromeStub,
  uninstallChromeStub,
  installFetchMock,
  makeProblemsPayload,
  makeSubmission,
  makeAcSubmissionsResponse,
  makeFetchResponder,
  makeCacheData,
  makeCacheEntry,
} from './helpers';

// ─── Migration ─────────────────────────────────────────────────────

describe('migrateStorageIfNeeded', () => {
  test('clears pre-migration caches including submissionCacheKey', async () => {
    const local = installChromeStub({
      localData: {
        problemsKey: { data: { problemsetQuestionList: { questions: [] } } },
        recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
        submissionCacheKey: makeCacheData({ 'x': makeCacheEntry() }),
      },
    });

    const result = await migrateStorageIfNeeded();
    expect(result.migrated).toBe(true);
    const stored = local._dump();
    expect(stored.problemsKey).toBeUndefined();
    expect(stored.recentSubmissionsKey).toBeUndefined();
    expect(stored.submissionCacheKey).toBeUndefined();
    expect(stored._storageVersion).toBe(2);
  });

  test('skips when version matches', async () => {
    const local = installChromeStub({
      localData: {
        _storageVersion: 2,
        problemsKey: { data: 'keep me' },
      },
    });

    const result = await migrateStorageIfNeeded();
    expect(result.migrated).toBe(false);
    const stored = local._dump();
    expect(stored.problemsKey).toEqual({ data: 'keep me' });
  });
});

// ─── Chronological validation ──────────────────────────────────────

describe('validateChronologicalOrder', () => {
  test('throws on ascending timestamps', () => {
    const submissions = [
      { timestamp: '100' },
      { timestamp: '200' },
    ];
    expect(() => validateChronologicalOrder(submissions)).toThrow();
  });

  test('accepts descending timestamps', () => {
    const submissions = [
      { timestamp: '200' },
      { timestamp: '100' },
    ];
    expect(() => validateChronologicalOrder(submissions)).not.toThrow();
  });
});

// ─── Submission sync ───────────────────────────────────────────────

describe('updateSubmissions', () => {
  test('performs a full sync via recentAcSubmissionList', async () => {
    installChromeStub({ localData: { recentSubmissionsKey: null } });

    // Full sync fetches via public recentAcSubmissionList (capped ~20)
    const acSubmissions = [
      makeSubmission({ id: 1, timestamp: 500 }),
      makeSubmission({ id: 3, timestamp: 300 }),
      makeSubmission({ id: 4, timestamp: 200 }),
      makeSubmission({ id: 5, timestamp: 100 }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));

    try {
      const result = await updateSubmissions({ username: 'tester' });
      expect(result.mode).toBe('incremental'); // newCount > 0
      expect(result.count).toBe(4); // total merged
      const stored = await (globalThis as any).chrome.storage.local.get(['recentSubmissionsKey']);
      const list = stored.recentSubmissionsKey.data.recentAcSubmissionList;
      expect(list.length).toBe(4);
      expect(list[0].timestamp).toBe('500');
      expect(list[3].timestamp).toBe('100');
      expect(stored.recentSubmissionsKey.firstSyncedAt).toBeTruthy();
      expect(stored.recentSubmissionsKey.source).toBe('recentAcSubmissionList');
    } finally {
      restoreFetch();
    }
  });

  test('performs incremental sync via recentAcSubmissionList', async () => {
    const existing = {
      data: {
        recentAcSubmissionList: [
          { id: 'a', title: 'A', titleSlug: 'a', timestamp: '500' },
          { id: 'b', title: 'B', titleSlug: 'b', timestamp: '400' },
        ],
      },
      firstSyncedAt: 1,
      lastSyncedAt: 2,
      lastSyncedTimestamp: '500',
    };

    installChromeStub({ localData: { recentSubmissionsKey: existing } });

    // Incremental sync uses recentAcSubmissionList (public, ~20 cap)
    const acSubmissions = [
      makeSubmission({ id: 6, timestamp: 700 }),
      makeSubmission({ id: 7, timestamp: 600 }),
      makeSubmission({ id: 'a' as any, timestamp: 500 }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));

    try {
      const result = await updateSubmissions({ username: 'tester' });
      expect(result.mode).toBe('incremental');
      expect(result.count).toBe(4); // total merged (2 existing + 2 new)
      const stored = await (globalThis as any).chrome.storage.local.get(['recentSubmissionsKey']);
      const list = stored.recentSubmissionsKey.data.recentAcSubmissionList;
      expect(list[0].timestamp).toBe('700');
      expect(list[1].timestamp).toBe('600');
      expect(list[2].timestamp).toBe('500');
      expect(list[3].timestamp).toBe('400');
    } finally {
      restoreFetch();
    }
  });
});

// ─── Incremental Sync (Layer 3) ────────────────────────────────────

describe('incrementalSync', () => {
  test('populates cache from recent accepted (empty cache)', async () => {
    installChromeStub({ localData: {} });

    const acSubmissions = [
      makeSubmission({ id: 1, timestamp: 500, titleSlug: 'a' }),
      makeSubmission({ id: 2, timestamp: 300, titleSlug: 'b' }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));

    try {
      const result = await incrementalSync('tester');
      expect(result.gapDetected).toBe(false);
      expect(result.newCount).toBe(2);
      expect(result.cache.entries['a'].solved).toBe(true);
      expect(result.cache.entries['a'].latestAcceptedTimestamp).toBe(500);
      expect(result.cache.entries['b'].solved).toBe(true);
      expect(result.cache.entries['b'].latestAcceptedTimestamp).toBe(300);
    } finally {
      restoreFetch();
    }
  });

  test('detects gap when no overlap with existing cache', async () => {
    const existingCache = makeCacheData({
      old: makeCacheEntry({ solved: true, latestAcceptedTimestamp: 100 }),
    });

    installChromeStub({ localData: {} });

    // None of the recent subs match 'old' in the cache
    const acSubmissions = [
      makeSubmission({ id: 1, timestamp: 500, titleSlug: 'new-a' }),
      makeSubmission({ id: 2, timestamp: 400, titleSlug: 'new-b' }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));

    try {
      const result = await incrementalSync('tester', existingCache);
      expect(result.gapDetected).toBe(true);
      expect(result.cache.cacheStatus).toBe('stale');
    } finally {
      restoreFetch();
    }
  });

  test('no gap when recent submissions overlap with cache', async () => {
    const existingCache = makeCacheData({
      'two-sum': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 500 }),
    });

    installChromeStub({ localData: {} });

    const acSubmissions = [
      makeSubmission({ id: 10, timestamp: 700, titleSlug: 'new-problem' }),
      makeSubmission({ id: 1, timestamp: 500, titleSlug: 'two-sum' }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));

    try {
      const result = await incrementalSync('tester', existingCache);
      expect(result.gapDetected).toBe(false);
      expect(result.newCount).toBe(1); // only 'new-problem' is new
      expect(result.cache.entries['new-problem'].solved).toBe(true);
    } finally {
      restoreFetch();
    }
  });

  test('skips when no username', async () => {
    installChromeStub({ localData: {} });
    const result = await incrementalSync('');
    expect(result.newCount).toBe(0);
    expect(result.gapDetected).toBe(false);
  });

  test('updates timestamp when newer submission exists', async () => {
    const existingCache = makeCacheData({
      'two-sum': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 500 }),
    });

    installChromeStub({ localData: {} });

    const acSubmissions = [
      makeSubmission({ id: 1, timestamp: 700, titleSlug: 'two-sum' }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));
    try {
      const result = await incrementalSync('tester', existingCache);
      expect(result.cache.entries['two-sum'].latestAcceptedTimestamp).toBe(700);
      expect(result.newCount).toBe(1);
      expect(result.gapDetected).toBe(false);
    } finally {
      restoreFetch();
    }
  });

  test('preserves existing timestamp when not newer', async () => {
    const existingCache = makeCacheData({
      'two-sum': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 700 }),
    });

    installChromeStub({ localData: {} });

    // Older submission comes in
    const acSubmissions = [
      makeSubmission({ id: 1, timestamp: 500, titleSlug: 'two-sum' }),
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));
    try {
      const result = await incrementalSync('tester', existingCache);
      // Timestamp should NOT change
      expect(result.cache.entries['two-sum'].latestAcceptedTimestamp).toBe(700);
      expect(result.newCount).toBe(0);
      expect(result.gapDetected).toBe(false);
    } finally {
      restoreFetch();
    }
  });

  test('mixed: new entries, updated timestamps, and unchanged', async () => {
    const existingCache = makeCacheData({
      'slug-a': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 300 }),
      'slug-b': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 500 }),
      'slug-c': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 800 }),
    });

    installChromeStub({ localData: {} });

    const acSubmissions = [
      makeSubmission({ id: 10, timestamp: 1000, titleSlug: 'brand-new' }),   // new
      makeSubmission({ id: 11, timestamp: 900, titleSlug: 'also-new' }),     // new
      makeSubmission({ id: 1, timestamp: 600, titleSlug: 'slug-a' }),        // update (300 → 600)
      makeSubmission({ id: 2, timestamp: 400, titleSlug: 'slug-b' }),        // no update (500 > 400)
    ];

    const restoreFetch = installFetchMock(makeFetchResponder({ acSubmissions }));
    try {
      const result = await incrementalSync('tester', existingCache);
      // 2 new + 1 updated = 3 newCount
      expect(result.newCount).toBe(3);
      expect(result.gapDetected).toBe(false); // slug-a overlap found
      expect(result.cache.entries['brand-new'].solved).toBe(true);
      expect(result.cache.entries['brand-new'].latestAcceptedTimestamp).toBe(1000);
      expect(result.cache.entries['also-new'].latestAcceptedTimestamp).toBe(900);
      expect(result.cache.entries['slug-a'].latestAcceptedTimestamp).toBe(600);
      expect(result.cache.entries['slug-b'].latestAcceptedTimestamp).toBe(500); // unchanged
      expect(result.cache.entries['slug-c'].latestAcceptedTimestamp).toBe(800); // untouched
    } finally {
      restoreFetch();
    }
  });
});
