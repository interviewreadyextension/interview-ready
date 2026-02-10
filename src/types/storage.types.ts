import type { Problem, AcceptedSubmission, UserStatus } from './models';

/**
 * Storage schema for chrome.storage.local
 */
export interface StorageSchema {
  problemsKey: ProblemData;
  recentSubmissionsKey: SubmissionData;
  userDataKey: UserStatus;
  _storageVersion: number;
  refresh_problems?: number;
  modal_opened?: number;
}

/**
 * Problem data structure in storage
 */
export interface ProblemData {
  data: {
    problemsetQuestionList: {
      total: number;
      questions: Problem[];
    };
  };
  source?: 'github';
  generatedAt?: string; // ISO timestamp from GitHub
  fetchStartedAt?: number; // Unix ms
  fetchCompletedAt?: number; // Unix ms
  lastAttemptAt?: number; // Unix ms
  lastError?: string | null;
  usingCache?: boolean;
  timeStamp?: number; // Unix ms
}

/**
 * Submission data structure in storage
 */
export interface SubmissionData {
  data: {
    recentAcSubmissionList: AcceptedSubmission[];
  };
  source?: string;
  firstSyncedAt?: number; // Unix ms
  lastSyncedAt?: number; // Unix ms
  lastSyncedTimestamp?: string | null; // Most recent submission timestamp
  lastError?: string | null;
  timeStamp?: number; // Unix ms
}

/**
 * Storage keys as constants
 */
export const STORAGE_KEYS = {
  problems: 'problemsKey',
  submissions: 'recentSubmissionsKey',
  userData: 'userDataKey',
  version: '_storageVersion',
  refreshTrigger: 'refresh_problems',
  modalTrigger: 'modal_opened',
} as const;

export type StorageKey = keyof StorageSchema;
