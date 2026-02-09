import { delog } from "./logging.js";

const DEFAULT_PROBLEMS_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SUBMISSION_LIMIT = 20;
const DEFAULT_MAX_PAGES = 200;

function nowMs() {
  return Date.now();
}

function parseTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return parsed;
}

function isAcceptedSubmission(submission) {
  if (!submission) return false;
  if (submission.statusDisplay === "Accepted") return true;
  return submission.status === 10;
}

function normalizeAcceptedSubmission(submission) {
  return {
    id: String(submission.id ?? ""),
    title: submission.title,
    titleSlug: submission.titleSlug,
    timestamp: String(submission.timestamp ?? ""),
  };
}

export function validateChronologicalOrder(submissions, label = "submissions") {
  if (!Array.isArray(submissions)) {
    throw new Error(`Expected ${label} to be an array`);
  }

  let previous = null;
  for (let index = 0; index < submissions.length; index += 1) {
    const current = parseTimestamp(submissions[index]?.timestamp);
    if (previous !== null && current > previous) {
      throw new Error(
        `Chronology violation in ${label} at index ${index}: ${current} > ${previous}`
      );
    }
    previous = current;
  }
}

async function queryData(queryBody) {
  const response = await fetch("https://leetcode.com/graphql/", {
    headers: {
      "content-type": "application/json",
    },
    body: queryBody,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchSubmissionListPage({ offset, limit, lastKey }) {
  const query = JSON.stringify({
    operationName: "submissionList",
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
    variables: {
      offset,
      limit,
      lastKey,
    },
  });

  const result = await queryData(query);
  const list = result?.data?.questionSubmissionList;
  if (!list || !Array.isArray(list.submissions)) {
    throw new Error("Unexpected submission list response from LeetCode");
  }

  return list;
}

export async function fetchAllAcceptedSubmissions({ limit = DEFAULT_SUBMISSION_LIMIT } = {}) {
  const accepted = [];
  let lastKey = null;
  let offset = 0;
  let hasNext = true;
  let pageCount = 0;

  while (hasNext) {
    if (pageCount >= DEFAULT_MAX_PAGES) {
      throw new Error("Exceeded maximum submission pages");
    }

    const page = await fetchSubmissionListPage({ offset, limit, lastKey });
    validateChronologicalOrder(page.submissions, "submission page");

    for (const submission of page.submissions) {
      if (isAcceptedSubmission(submission)) {
        accepted.push(normalizeAcceptedSubmission(submission));
      }
    }

    hasNext = Boolean(page.hasNext);
    lastKey = page.lastKey ?? null;
    offset += limit;
    pageCount += 1;
  }

  return accepted;
}

export async function fetchUntilSeen({ lastKnownTimestamp, limit = DEFAULT_SUBMISSION_LIMIT } = {}) {
  if (!lastKnownTimestamp) {
    throw new Error("Missing last known timestamp for incremental sync");
  }

  const knownValue = parseTimestamp(lastKnownTimestamp);
  const accepted = [];
  let lastKey = null;
  let offset = 0;
  let hasNext = true;
  let seenKnown = false;
  let pageCount = 0;

  while (hasNext && !seenKnown) {
    if (pageCount >= DEFAULT_MAX_PAGES) {
      throw new Error("Exceeded maximum submission pages while searching for known timestamp");
    }

    const page = await fetchSubmissionListPage({ offset, limit, lastKey });
    validateChronologicalOrder(page.submissions, "submission page");

    for (const submission of page.submissions) {
      const timestampValue = parseTimestamp(submission.timestamp);
      if (timestampValue <= knownValue) {
        seenKnown = true;
      }

      if (isAcceptedSubmission(submission)) {
        accepted.push(normalizeAcceptedSubmission(submission));
      }
    }

    hasNext = Boolean(page.hasNext);
    lastKey = page.lastKey ?? null;
    offset += limit;
    pageCount += 1;
  }

  return { accepted, seenKnown };
}

export async function updateProblems({
  githubRawUrl,
  problemsKey = "problemsKey",
  fetchTtlMs = DEFAULT_PROBLEMS_TTL_MS,
} = {}) {
  if (!githubRawUrl) {
    throw new Error("Missing GitHub raw URL for problems data");
  }

  const now = nowMs();
  const stored = await chrome.storage.local.get([problemsKey]);
  const existing = stored[problemsKey];

  if (existing?.fetchStartedAt && now - existing.fetchStartedAt < fetchTtlMs) {
    delog("Problems fetch skipped due to recent fetch semaphore");
    return { skipped: true };
  }

  await chrome.storage.local.set({
    [problemsKey]: {
      ...existing,
      fetchStartedAt: now,
      lastError: null,
    },
  });

  try {
    const response = await fetch(githubRawUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Problems fetch failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const questions = payload?.data?.problemsetQuestionList?.questions;
    if (!Array.isArray(questions)) {
      throw new Error("Problems payload missing data.problemsetQuestionList.questions");
    }

    const completedAt = nowMs();
    await chrome.storage.local.set({
      [problemsKey]: {
        ...payload,
        fetchStartedAt: now,
        fetchCompletedAt: completedAt,
        timeStamp: completedAt,
        source: "github",
        lastError: null,
      },
    });

    return { skipped: false, count: questions.length };
  } catch (error) {
    const message = error?.message || String(error);
    await chrome.storage.local.set({
      [problemsKey]: {
        ...existing,
        fetchStartedAt: 0,
        lastError: message,
        timeStamp: nowMs(),
      },
    });
    delog(`Problems fetch error: ${message}`);
    throw error;
  }
}

function mergeAcceptedSubmissions(newList, existingList) {
  const seen = new Set();
  const merged = [];

  const addItem = (item) => {
    const key = item.id ? `id:${item.id}` : `slug:${item.titleSlug}:ts:${item.timestamp}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  for (const item of newList) addItem(item);
  for (const item of existingList) addItem(item);

  merged.sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
  return merged;
}

export async function updateSubmissions({
  username,
  recentSubmissionsKey = "recentSubmissionsKey",
} = {}) {
  if (!username) {
    delog("No username available; skipping submissions update.");
    return { skipped: true };
  }

  const now = nowMs();
  const stored = await chrome.storage.local.get([recentSubmissionsKey]);
  const existing = stored[recentSubmissionsKey];

  try {
    if (!existing?.firstSyncedAt) {
      const accepted = await fetchAllAcceptedSubmissions();
      validateChronologicalOrder(accepted, "accepted submissions");

      const payload = {
        data: { recentAcSubmissionList: accepted },
        firstSyncedAt: now,
        lastSyncedAt: now,
        lastSyncedTimestamp: accepted[0]?.timestamp ?? null,
        timeStamp: now,
        source: "leetcode-submissionlist",
        lastError: null,
      };

      await chrome.storage.local.set({ [recentSubmissionsKey]: payload });
      return { mode: "full", count: accepted.length };
    }

    const lastKnownTimestamp = existing.lastSyncedTimestamp;
    if (!lastKnownTimestamp) {
      const accepted = await fetchAllAcceptedSubmissions();
      validateChronologicalOrder(accepted, "accepted submissions");

      const payload = {
        data: { recentAcSubmissionList: accepted },
        firstSyncedAt: existing.firstSyncedAt ?? now,
        lastSyncedAt: now,
        lastSyncedTimestamp: accepted[0]?.timestamp ?? null,
        timeStamp: now,
        source: existing.source ?? "leetcode-submissionlist",
        lastError: null,
      };

      await chrome.storage.local.set({ [recentSubmissionsKey]: payload });
      return { mode: "full", count: accepted.length };
    }

    const result = await fetchUntilSeen({ lastKnownTimestamp });
    validateChronologicalOrder(result.accepted, "accepted submissions");

    if (!result.seenKnown) {
      throw new Error("Incremental sync did not encounter the last known timestamp");
    }

    const merged = mergeAcceptedSubmissions(
      result.accepted,
      existing?.data?.recentAcSubmissionList ?? []
    );

    const payload = {
      ...existing,
      data: { recentAcSubmissionList: merged },
      lastSyncedAt: now,
      lastSyncedTimestamp: merged[0]?.timestamp ?? lastKnownTimestamp,
      timeStamp: now,
      lastError: null,
    };

    await chrome.storage.local.set({ [recentSubmissionsKey]: payload });
    return { mode: "incremental", count: result.accepted.length };
  } catch (error) {
    const message = error?.message || String(error);
    await chrome.storage.local.set({
      [recentSubmissionsKey]: {
        ...existing,
        lastError: message,
        lastSyncedAt: now,
        timeStamp: now,
      },
    });
    delog(`Submissions sync error: ${message}`);
    throw error;
  }
}

export async function fetchRecentAcceptedSubmissions({ username, limit = 50 } = {}) {
  if (!username) {
    throw new Error("Missing username for recent accepts query");
  }

  const query = JSON.stringify({
    operationName: "recentAcSubmissions",
    query: `query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
  }
}`,
    variables: { username, limit },
  });

  const result = await queryData(query);
  const list = result?.data?.recentAcSubmissionList;
  if (!Array.isArray(list)) {
    throw new Error("Unexpected recent accepts response from LeetCode");
  }

  return list.map(normalizeAcceptedSubmission);
}
