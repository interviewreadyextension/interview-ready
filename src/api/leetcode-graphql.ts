import type {
  GraphQLQuery,
  GraphQLResponse,
  GlobalDataResponse,
  RecentAcceptedResponse,
} from '../types/leetcode.types';
import type { UserStatus, AcceptedSubmission } from '../types/models';

/**
 * Shared LeetCode GraphQL endpoint.
 * Every API module should import this rather than hardcoding the URL.
 */
export const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';

// ─── Low-level fetch helper ────────────────────────────────────────

/** Execute a GraphQL POST against LeetCode. */
async function queryData<T>(queryBody: string): Promise<GraphQLResponse<T>> {
  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    headers: {
      'content-type': 'application/json',
      'Referer': 'https://leetcode.com',
    },
    body: queryBody,
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ─── Public API functions ───────────────────────────────────────────

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
 * Fetch recent accepted submissions for a user (public, no auth needed).
 * Capped at ~20 results by LeetCode — suitable for incremental sync only.
 */
export async function fetchRecentAcceptedSubmissions(
  username: string,
  limit: number = 20
): Promise<AcceptedSubmission[]> {
  const query: GraphQLQuery<{ username: string; limit: number }> = {
    operationName: 'getACSubmissions',
    query: `query getACSubmissions($username: String!, $limit: Int) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
    statusDisplay
    lang
  }
}`,
    variables: { username, limit },
  };

  const result = await queryData<RecentAcceptedResponse>(JSON.stringify(query));
  const list = result.data.recentAcSubmissionList;

  if (!Array.isArray(list)) {
    throw new Error('Unexpected recentAcSubmissionList response from LeetCode');
  }

  // Normalize to our AcceptedSubmission shape
  return list.map((item) => ({
    id: String(item.id ?? ''),
    title: item.title ?? '',
    titleSlug: item.titleSlug ?? '',
    timestamp: String(item.timestamp ?? ''),
  }));
}
