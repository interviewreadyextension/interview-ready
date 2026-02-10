import test from "node:test";
import assert from "node:assert/strict";
import {
  installChromeStub,
  uninstallChromeStub,
} from "./_helpers.mjs";
import {
  migrateStorageIfNeeded,
  updateProblems,
  updateSubmissions,
  validateChronologicalOrder,
} from "../../src/shared/sync-logic.js";

const problemsUrl = "https://example.com/problems.json";

function makeSubmission({
  id,
  timestamp,
  titleSlug = "two-sum",
  statusDisplay = "Accepted",
  status = 10,
}) {
  return {
    id: String(id),
    title: "Two Sum",
    titleSlug,
    statusDisplay,
    status,
    timestamp: String(timestamp),
  };
}

function makeSubmissionPage({ submissions, hasNext, lastKey }) {
  return {
    data: {
      questionSubmissionList: {
        submissions,
        hasNext,
        lastKey: lastKey ?? null,
      },
    },
  };
}

function makeProblemsPayload() {
  return {
    data: {
      problemsetQuestionList: {
        total: 1,
        questions: [
          {
            acRate: 50,
            difficulty: "Easy",
            frontendQuestionId: "1",
            isFavor: false,
            paidOnly: false,
            status: null,
            title: "Two Sum",
            titleSlug: "two-sum",
            topicTags: [{ name: "Array", id: "1", slug: "array" }],
            hasSolution: true,
            hasVideoSolution: true,
          },
        ],
      },
    },
  };
}

function installFetchMock(impl) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function makeGraphQLFetchResponder(pages) {
  return async (url, options = {}) => {
    if (url === problemsUrl) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => makeProblemsPayload(),
      };
    }

    if (url === "https://leetcode.com/graphql/") {
      const body = JSON.parse(options.body ?? "{}");
      if (body.operationName === "submissionList") {
        const offset = body.variables?.offset ?? 0;
        const pageIndex = Math.floor(offset / 20);
        const page = pages[pageIndex];
        if (!page) {
          throw new Error(`Unexpected submission page request at offset ${offset}`);
        }
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => page,
        };
      }
    }

    throw new Error(`Unexpected fetch call to ${url}`);
  };
}

// ─── Migration tests ───────────────────────────────────────────────

test("migrateStorageIfNeeded clears pre-migration caches", async () => {
  const local = installChromeStub({
    localData: {
      problemsKey: { data: { problemsetQuestionList: { questions: [] } } },
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
    },
  });

  try {
    const result = await migrateStorageIfNeeded();
    assert.equal(result.migrated, true);
    const stored = local._dump();
    assert.equal(stored.problemsKey, undefined);
    assert.equal(stored.recentSubmissionsKey, undefined);
    assert.equal(stored._storageVersion, 1);
  } finally {
    uninstallChromeStub();
  }
});

test("migrateStorageIfNeeded skips when version matches", async () => {
  const local = installChromeStub({
    localData: {
      _storageVersion: 1,
      problemsKey: { data: "keep me" },
    },
  });

  try {
    const result = await migrateStorageIfNeeded();
    assert.equal(result.migrated, false);
    const stored = local._dump();
    assert.deepEqual(stored.problemsKey, { data: "keep me" });
  } finally {
    uninstallChromeStub();
  }
});

// ─── Chronological validation ─────────────────────────────────────

test("validateChronologicalOrder throws on ascending timestamps", () => {
  const submissions = [
    { timestamp: "100" },
    { timestamp: "200" },
  ];

  assert.throws(() => validateChronologicalOrder(submissions));
});

test("updateProblems sets semaphore before fetch", async () => {
  const local = installChromeStub({ localData: { problemsKey: {} } });
  const restoreFetch = installFetchMock(async (url) => {
    assert.equal(url, problemsUrl);
    const current = await local.get(["problemsKey"]);
    assert.ok(current.problemsKey.fetchStartedAt);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => makeProblemsPayload(),
    };
  });

  try {
    await updateProblems({ githubRawUrl: problemsUrl });
    const stored = await local.get(["problemsKey"]);
    assert.ok(stored.problemsKey.fetchCompletedAt);
    assert.equal(stored.problemsKey.source, "github");
  } finally {
    restoreFetch();
    uninstallChromeStub();
  }
});

test("updateProblems uses cached data when GitHub fails", async () => {
  const cachedProblems = {
    ...makeProblemsPayload(),
    source: "github",
    fetchStartedAt: 0,
    fetchCompletedAt: 100,
    timeStamp: 100,
  };
  const local = installChromeStub({ localData: { problemsKey: cachedProblems } });
  const restoreFetch = installFetchMock(async (url) => {
    return { ok: false, status: 404, statusText: "Not Found" };
  });

  try {
    const result = await updateProblems({ githubRawUrl: problemsUrl });
    assert.equal(result.usingCache, true);
    // Cached data should still be intact
    const stored = await local.get(["problemsKey"]);
    assert.equal(stored.problemsKey.source, "github");
    assert.equal(stored.problemsKey.fetchCompletedAt, 100);
    assert.ok(stored.problemsKey.lastError);
  } finally {
    restoreFetch();
    uninstallChromeStub();
  }
});

test("updateSubmissions performs a full sync", async () => {
  installChromeStub({ localData: { recentSubmissionsKey: null } });

  const pages = [
    makeSubmissionPage({
      submissions: [
        makeSubmission({ id: 1, timestamp: 500 }),
        makeSubmission({ id: 2, timestamp: 400, statusDisplay: "Wrong Answer", status: 11 }),
        makeSubmission({ id: 3, timestamp: 300 }),
      ],
      hasNext: true,
      lastKey: "next",
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
    await updateSubmissions({ username: "tester" });
    const stored = await chrome.storage.local.get(["recentSubmissionsKey"]);
    const list = stored.recentSubmissionsKey.data.recentAcSubmissionList;
    assert.equal(list.length, 4);
    assert.equal(list[0].timestamp, "500");
    assert.equal(list[3].timestamp, "100");
    assert.ok(stored.recentSubmissionsKey.firstSyncedAt);
  } finally {
    restoreFetch();
    uninstallChromeStub();
  }
});

test("updateSubmissions performs incremental sync until seen", async () => {
  const existing = {
    data: {
      recentAcSubmissionList: [
        { id: "a", title: "A", titleSlug: "a", timestamp: "500" },
        { id: "b", title: "B", titleSlug: "b", timestamp: "400" },
      ],
    },
    firstSyncedAt: 1,
    lastSyncedAt: 2,
    lastSyncedTimestamp: "500",
  };

  installChromeStub({ localData: { recentSubmissionsKey: existing } });

  const pages = [
    makeSubmissionPage({
      submissions: [
        makeSubmission({ id: 6, timestamp: 700 }),
        makeSubmission({ id: 7, timestamp: 600 }),
        makeSubmission({ id: "a", timestamp: 500 }),
      ],
      hasNext: false,
      lastKey: null,
    }),
  ];

  const restoreFetch = installFetchMock(makeGraphQLFetchResponder(pages));

  try {
    await updateSubmissions({ username: "tester" });
    const stored = await chrome.storage.local.get(["recentSubmissionsKey"]);
    const list = stored.recentSubmissionsKey.data.recentAcSubmissionList;
    assert.equal(list[0].timestamp, "700");
    assert.equal(list[1].timestamp, "600");
    assert.equal(list[2].timestamp, "500");
    assert.equal(list[3].timestamp, "400");
  } finally {
    restoreFetch();
    uninstallChromeStub();
  }
});
