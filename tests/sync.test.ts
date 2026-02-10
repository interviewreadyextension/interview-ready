import { describe, test, expect, vi } from 'vitest';
import { migrateStorageIfNeeded } from '../src/sync/migration';
import { updateSubmissions, validateChronologicalOrder } from '../src/sync/submission-sync';
import {
  installChromeStub,
  uninstallChromeStub,
  installFetchMock,
  makeProblemsPayload,
  makeSubmission,
  makeAcSubmissionsResponse,
  makeFetchResponder,
} from './helpers';

// ─── Migration ─────────────────────────────────────────────────────

describe('migrateStorageIfNeeded', () => {
  test('clears pre-migration caches', async () => {
    const local = installChromeStub({
      localData: {
        problemsKey: { data: { problemsetQuestionList: { questions: [] } } },
        recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      },
    });

    const result = await migrateStorageIfNeeded();
    expect(result.migrated).toBe(true);
    const stored = local._dump();
    expect(stored.problemsKey).toBeUndefined();
    expect(stored.recentSubmissionsKey).toBeUndefined();
    expect(stored._storageVersion).toBe(1);
  });

  test('skips when version matches', async () => {
    const local = installChromeStub({
      localData: {
        _storageVersion: 1,
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
