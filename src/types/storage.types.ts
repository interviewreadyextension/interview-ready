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
  /** Per-problem submission cache with solved status + timestamps */
  submissionCacheKey: SubmissionCacheData;
  /** Legacy accumulated submissions (kept for migration compat) */
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

// ─── Submission Cache ───────────────────────────────────────────────

/**
 * Cache status lifecycle:
 *   'empty'    → first install, no data yet
 *   'building' → full scan in progress
 *   'valid'    → cache is up-to-date, incremental sync found no gaps
 *   'stale'    → incremental sync detected a gap; full rescan needed
 */
export type CacheStatus = 'empty' | 'building' | 'valid' | 'stale';

/** Per-problem entry in the submission cache. */
export interface SubmissionCacheEntry {
  /** Whether the user has at least one accepted submission */
  solved: boolean;
  /** Unix seconds of the latest accepted submission (null if unsolved) */
  latestAcceptedTimestamp: number | null;
  /** Unix ms when this entry was last verified via API */
  checkedAt: number;
}

/**
 * Top-level submission cache stored in `submissionCacheKey`.
 *
 * Maps `titleSlug → SubmissionCacheEntry` for every problem we've
 * scanned. The `cacheStatus` field drives the sync orchestration:
 * when 'stale' or 'empty', a full scan is triggered.
 */
export interface SubmissionCacheData {
  /** Per-problem lookup:  slug → { solved, latestAcceptedTimestamp, checkedAt } */
  entries: Record<string, SubmissionCacheEntry>;
  /** Lifecycle status — drives sync decisions */
  cacheStatus: CacheStatus;
  /** Unix ms of last completed full scan (null if never) */
  lastFullScanAt: number | null;
  /** Unix ms of last incremental sync */
  lastIncrementalAt: number | null;
  /** Last error message, if any */
  lastError?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

export type StorageKey = keyof StorageSchema;
