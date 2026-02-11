/**
 * Domain model types shared across the extension.
 *
 * These interfaces define the shapes used by the sync layer, readiness
 * logic, and popup — they are the single source of truth for what a
 * "Problem", "Submission", and "UserStatus" look like at runtime.
 */

// ─── LeetCode Problem ───────────────────────────────────────────────

/**
 * A single LeetCode problem as returned by the `problemsetQuestionList`
 * GraphQL query.  The `status` field is populated only when the user is
 * authenticated (content script running on leetcode.com).
 */
export interface Problem {
  acRate: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  frontendQuestionId: string;
  isFavor: boolean;
  paidOnly: boolean;
  /** 'ac' | 'notac' | null — null means the user has never attempted it */
  status: string | null;
  title: string;
  titleSlug: string;
  topicTags: TopicTag[];
  hasSolution: boolean;
  hasVideoSolution: boolean;
}

export interface TopicTag {
  name: string;
  id: string;
  slug: string;
}

// ─── Accepted Submission ────────────────────────────────────────────

/**
 * A single accepted submission, normalised from various LeetCode APIs.
 * `timestamp` is a Unix‑second value stored as a string (LeetCode convention).
 */
export interface AcceptedSubmission {
  id: string;
  title: string;
  titleSlug: string;
  /** Unix timestamp in seconds, stored as a string */
  timestamp: string;
}

// ─── User Status ────────────────────────────────────────────────────

/** Current user status returned by the `globalData` GraphQL query. */
export interface UserStatus {
  isSignedIn: boolean;
  isPremium: boolean;
  username: string;
  realName?: string;
  avatar?: string;
}
