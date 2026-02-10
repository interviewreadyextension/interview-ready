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
 * Submission list query
 */
export interface SubmissionListVariables {
  offset: number;
  limit: number;
  lastKey: string | null;
}

export interface SubmissionListResponse {
  questionSubmissionList: {
    lastKey: string | null;
    hasNext: boolean;
    submissions: LeetCodeSubmission[];
  };
}

export interface LeetCodeSubmission {
  id: string;
  title: string;
  titleSlug: string;
  status: number; // 10 = Accepted
  statusDisplay: string; // "Accepted", "Wrong Answer", etc.
  timestamp: string;
}

/**
 * Recent accepted submissions query (alternative endpoint)
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
