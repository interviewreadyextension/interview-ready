/**
 * Test helpers — Chrome API mocks and factory functions for test data.
 */
import type { Problem, TopicTag } from '../src/types/models';
import type { ProblemData, SubmissionData, StorageSchema } from '../src/types/storage.types';

// ─── Chrome storage mock ────────────────────────────────────────────

interface MockStorage {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  _dump: () => Record<string, unknown>;
}

export function makeChromeStorage(initialData: Record<string, unknown> = {}): MockStorage {
  const data: Record<string, unknown> = { ...initialData };

  return {
    get: async (keys: string | string[]) => {
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = data[key];
        }
        return result;
      }
      if (typeof keys === 'string') {
        return { [keys]: data[keys] };
      }
      return { ...data };
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    },
    remove: async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete data[key];
      }
    },
    _dump: () => ({ ...data }),
  };
}

interface ChromeStubOptions {
  localData?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
}

export function installChromeStub(options: ChromeStubOptions = {}): MockStorage {
  const { localData = {}, manifest = {} } = options;
  const local = makeChromeStorage(localData);

  (globalThis as any).chrome = {
    runtime: {
      getManifest: () => manifest,
    },
    storage: {
      local,
      onChanged: {
        addListener: () => { /* noop */ },
      },
    },
    tabs: {
      query: () => { throw new Error('tabs.query called in unit test'); },
      update: () => { throw new Error('tabs.update called in unit test'); },
      create: () => { throw new Error('tabs.create called in unit test'); },
    },
  };

  return local;
}

export function uninstallChromeStub(): void {
  delete (globalThis as any).chrome;
}

// ─── Factory functions ──────────────────────────────────────────────

export function makeAllProblems(questions: Problem[]): ProblemData {
  return {
    data: {
      problemsetQuestionList: {
        total: questions.length,
        questions,
      },
    },
  };
}

interface QuickProblemOptions {
  titleSlug: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  acRate?: number;
  status?: string | null;
  paidOnly?: boolean;
  topicSlugs?: string[];
}

/**
 * Quick problem factory — creates a minimal `Problem` for tests.
 */
export function q(opts: QuickProblemOptions): Problem {
  const {
    titleSlug,
    difficulty = 'Easy',
    acRate = 50,
    status = null,
    paidOnly = false,
    topicSlugs = [],
  } = opts;

  return {
    acRate,
    difficulty,
    frontendQuestionId: '0',
    isFavor: false,
    paidOnly,
    status,
    title: titleSlug,
    titleSlug,
    topicTags: topicSlugs.map((slug): TopicTag => ({ slug, name: slug, id: slug })),
    hasSolution: false,
    hasVideoSolution: false,
  };
}

// ─── Fetch mock helpers ─────────────────────────────────────────────

export function installFetchMock(
  impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

export function makeProblemsPayload(): ProblemData {
  return {
    data: {
      problemsetQuestionList: {
        total: 1,
        questions: [
          q({
            titleSlug: 'two-sum',
            difficulty: 'Easy',
            acRate: 50,
            topicSlugs: ['array'],
          }),
        ],
      },
    },
  };
}

/**
 * Create an AcceptedSubmission-shaped entry (camelCase).
 */
export function makeSubmission(opts: {
  id: number | string;
  timestamp: number;
  titleSlug?: string;
}) {
  return {
    id: String(opts.id),
    title: 'Two Sum',
    titleSlug: opts.titleSlug ?? 'two-sum',
    timestamp: String(opts.timestamp),
  };
}

/**
 * Build a `recentAcSubmissionList` GraphQL response (public, ~20 cap).
 */
export function makeAcSubmissionsResponse(submissions: ReturnType<typeof makeSubmission>[]) {
  return {
    data: {
      recentAcSubmissionList: submissions,
    },
  };
}

/**
 * Build a fetch mock that routes GraphQL requests to the correct handler:
 *   - `getACSubmissions` → recentAcSubmissionList response
 *   - `globalData`       → user status response
 */
export function makeFetchResponder(opts: {
  acSubmissions?: ReturnType<typeof makeSubmission>[];
}) {
  const { acSubmissions } = opts;

  return async (url: string | URL | Request, options: RequestInit = {}): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;

    // GraphQL
    if (urlStr === 'https://leetcode.com/graphql/') {
      const body = JSON.parse(options.body as string ?? '{}');

      if (body.operationName === 'globalData') {
        return new Response(JSON.stringify({
          data: { userStatus: { isSignedIn: true, isPremium: false, username: 'tester' } },
        }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Public recent-accepted endpoint (incremental sync)
      if (body.operationName === 'getACSubmissions' && acSubmissions) {
        return new Response(JSON.stringify(makeAcSubmissionsResponse(acSubmissions)), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    throw new Error(`Unexpected fetch call to ${urlStr}`);
  };
}
