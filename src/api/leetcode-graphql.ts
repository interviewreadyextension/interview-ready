import type {
  GraphQLQuery,
  GraphQLResponse,
  GlobalDataResponse,
  SubmissionListVariables,
  SubmissionListResponse,
  LeetCodeSubmission,
} from '../types/leetcode.types';
import type { UserStatus } from '../types/models';
// import { delog } from '../shared/logging';

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';

/**
 * Execute a GraphQL query against LeetCode
 */
async function queryData<T>(queryBody: string): Promise<GraphQLResponse<T>> {
  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    headers: {
      'content-type': 'application/json',
    },
    body: queryBody,
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch user status (signed in, premium, username)
 */
export async function fetchUserStatus(): Promise<UserStatus> {
  const query: GraphQLQuery = {
    operationName: 'globalData',
    query: 'query globalData {userStatus {isSignedIn isPremium username realName avatar}}',
    variables: {},
  };

  const result = await queryData<GlobalDataResponse>(JSON.stringify(query));
  return result.data.userStatus;
}

/**
 * Fetch a single page of submissions
 */
export async function fetchSubmissionListPage(
  variables: SubmissionListVariables
): Promise<SubmissionListResponse['questionSubmissionList']> {
  const query: GraphQLQuery<SubmissionListVariables> = {
    operationName: 'submissionList',
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
    variables,
  };

  const result = await queryData<SubmissionListResponse>(JSON.stringify(query));
  const list = result.data.questionSubmissionList;

  if (!list || !Array.isArray(list.submissions)) {
    throw new Error('Unexpected submission list response from LeetCode');
  }

  return list;
}

/**
 * Check if a submission is accepted
 */
export function isAcceptedSubmission(submission: LeetCodeSubmission): boolean {
  if (!submission) return false;
  if (submission.statusDisplay === 'Accepted') return true;
  return submission.status === 10;
}
