import type { Problem, AcceptedSubmission, UserStatus } from './models';

// ─── Storage Schema ─────────────────────────────────────────────────

/**
 * Full schema for chrome.storage.local.
 * Every key the extension reads/writes should be declared here so
 * that `getStorage()` / `setStorage()` remain type-safe.
 */
export interface StorageSchema {
  /** All LeetCode problems (fetched from API in batches) */
  problemsKey: ProblemData;
  /** Accumulated accepted submissions (merged over time) */
  recentSubmissionsKey: SubmissionData;
  /** Current LeetCode user status (signed-in, premium, username) */
  userDataKey: UserStatus;
  /** Migration version number */
  _storageVersion: number;
  /** Popup → content-script: trigger a full problem refresh */
  refresh_problems?: number;
  /** Popup → content-script: trigger a submission refresh */
  modal_opened?: number;
}

// ─── Problem Data ───────────────────────────────────────────────────

/**
 * Problem data stored in `problemsKey`.
 *
 * `data.problemsetQuestionList` mirrors the LeetCode GraphQL shape so
 * downstream code can work with the response directly.
 */
export interface ProblemData {
  data: {
    problemsetQuestionList: {
      total: number;
      questions: Problem[];
    };
  };
  /** Where problems were fetched from */
  source?: 'leetcode';
  fetchStartedAt?: number;   // Unix ms – set before fetch begins
  fetchCompletedAt?: number; // Unix ms – set after fetch succeeds
  lastAttemptAt?: number;    // Unix ms – set on every attempt
  lastError?: string | null;
  usingCache?: boolean;
  timeStamp?: number;        // Unix ms – general last-modified
}

// ─── Submission Data ────────────────────────────────────────────────

/**
 * Accepted submission history stored in `recentSubmissionsKey`.
 *
 * The list is accumulated over time via `recentAcSubmissionList`
 * (public API, ~20 cap per call) and merged with previously stored
 * entries so the list grows with each popup open / refresh.
 */
export interface SubmissionData {
  data: {
    recentAcSubmissionList: AcceptedSubmission[];
  };
  source?: string;
  firstSyncedAt?: number;          // Unix ms – first-ever sync timestamp
  lastSyncedAt?: number;           // Unix ms – most recent sync timestamp
  lastSyncedTimestamp?: string | null; // Newest submission's Unix-second timestamp
  lastError?: string | null;
  timeStamp?: number;              // Unix ms – general last-modified
}

// ─── Helpers ────────────────────────────────────────────────────────

export type StorageKey = keyof StorageSchema;
