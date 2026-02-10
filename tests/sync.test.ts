import { describe, test, expect, vi } from 'vitest';
import { migrateStorageIfNeeded } from '../src/sync/migration';
import { updateProblems } from '../src/sync/problem-sync';
import { updateSubmissions, validateChronologicalOrder } from '../src/sync/submission-sync';
import { PROBLEMS_GITHUB_URL } from '../src/api/github-api';
import {
  installChromeStub,
  uninstallChromeStub,
  installFetchMock,
  makeProblemsPayload,
  makeSubmission,
  makeSubmissionPage,
  makeGraphQLFetchResponder,
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

// ─── Problem sync ──────────────────────────────────────────────────

describe('updateProblems', () => {
  test('sets semaphore before fetch', async () => {
    const local = installChromeStub({ localData: { problemsKey: {} } });
    const restoreFetch = installFetchMock(async (url) => {
      expect(String(url)).toBe(PROBLEMS_GITHUB_URL);
      const current = await local.get(['problemsKey']);
      expect((current.problemsKey as any).fetchStartedAt).toBeTruthy();
      return new Response(JSON.stringify(makeProblemsPayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      await updateProblems();
      const stored = await local.get(['problemsKey']);
      const problems = stored.problemsKey as any;
      expect(problems.fetchCompletedAt).toBeTruthy();
      expect(problems.source).toBe('github');
    } finally {
      restoreFetch();
    }
  });

  test('uses cached data when GitHub fails', async () => {
    const cachedProblems = {
      ...makeProblemsPayload(),
      source: 'github',
      fetchStartedAt: 0,
      fetchCompletedAt: 100,
      timeStamp: 100,
    };
    installChromeStub({ localData: { problemsKey: cachedProblems } });
    const restoreFetch = installFetchMock(async () => {
      return new Response('', { status: 404, statusText: 'Not Found' });
    });

    try {
      const result = await updateProblems();
      expect(result.usingCache).toBe(true);
      const stored = await (globalThis as any).chrome.storage.local.get(['problemsKey']);
      const problems = stored.problemsKey as any;
      expect(problems.source).toBe('github');
      expect(problems.fetchCompletedAt).toBe(100);
      expect(problems.lastError).toBeTruthy();
    } finally {
      restoreFetch();
    }
  });
});

// ─── Submission sync ───────────────────────────────────────────────

describe('updateSubmissions', () => {
  test('performs a full sync', async () => {
    installChromeStub({ localData: { recentSubmissionsKey: null } });

    const pages = [
      makeSubmissionPage({
        submissions: [
          makeSubmission({ id: 1, timestamp: 500 }),
          makeSubmission({ id: 2, timestamp: 400, statusDisplay: 'Wrong Answer', status: 11 }),
          makeSubmission({ id: 3, timestamp: 300 }),
        ],
        hasNext: true,
        lastKey: 'next',
      }),
      makeSubmissionPage({
        submissions: [
          makeSubmission({ id: 4, timestamp: 200 }),
          makeSubmission({ id: 5, timestamp: 100 }),
        ],
        hasNext: false,
        lastKey: null,
      }),
    ];

    const restoreFetch = installFetchMock(makeGraphQLFetchResponder(pages));

    try {
      await updateSubmissions({ username: 'tester' });
      const stored = await (globalThis as any).chrome.storage.local.get(['recentSubmissionsKey']);
      const list = stored.recentSubmissionsKey.data.recentAcSubmissionList;
      // id 2 was "Wrong Answer" → filtered out
      expect(list.length).toBe(4);
      expect(list[0].timestamp).toBe('500');
      expect(list[3].timestamp).toBe('100');
      expect(stored.recentSubmissionsKey.firstSyncedAt).toBeTruthy();
    } finally {
      restoreFetch();
    }
  });

  test('performs incremental sync until seen', async () => {
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

    const pages = [
      makeSubmissionPage({
        submissions: [
          makeSubmission({ id: 6, timestamp: 700 }),
          makeSubmission({ id: 7, timestamp: 600 }),
          makeSubmission({ id: 'a' as any, timestamp: 500 }),
        ],
        hasNext: false,
        lastKey: null,
      }),
    ];

    const restoreFetch = installFetchMock(makeGraphQLFetchResponder(pages));

    try {
      await updateSubmissions({ username: 'tester' });
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
