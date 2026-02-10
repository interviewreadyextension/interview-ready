import type { Problem, AcceptedSubmission, UserStatus } from './models';

/**
 * LeetCode GraphQL response types
 */

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
 * GraphQL query bodies
 */
export interface GraphQLQuery<T = unknown> {
  operationName: string;
  query: string;
  variables: T;
}
