/**
 * LeetCode GraphQL request and response types.
 *
 * Mirrors the shapes returned by LeetCode's `/graphql/` endpoint.
 * Used by `leetcode-graphql.ts` and `leetcode-problems.ts` to
 * type-check API interactions without runtime validation.
 */

import type { Problem, AcceptedSubmission, UserStatus } from './models';

export interface GraphQLResponse<T> {
  data: T;
}

/**
 * Global data (user status) query
 */
export interface GlobalDataResponse {
  userStatus: UserStatus;
}

/**
 * Problem set query (from GitHub, originally from LeetCode)
 */
export interface ProblemSetResponse {
  problemsetQuestionList: {
    total: number;
    questions: Problem[];
  };
}

/**
 * Public recent accepted submissions query (`recentAcSubmissionList` — no auth, capped ~20)
 */
export interface RecentAcceptedVariables {
  username: string;
  limit: number;
}

export interface RecentAcceptedResponse {
  recentAcSubmissionList: AcceptedSubmission[];
}

/**
 * Per-problem submission list query (`questionSubmissionList` — auth required)
 */
export interface QuestionSubmissionListResponse {
  questionSubmissionList: {
    lastKey: string | null;
    hasNext: boolean;
    submissions: Array<{
      timestamp: string;
      statusDisplay: string;
    }>;
  };
}

/**
 * GraphQL query bodies
 */
export interface GraphQLQuery<T = unknown> {
  operationName: string;
  query: string;
  variables: T;
}
