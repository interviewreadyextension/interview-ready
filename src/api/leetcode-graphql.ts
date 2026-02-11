import type {
  GraphQLQuery,
  GraphQLResponse,
  GlobalDataResponse,
  RecentAcceptedResponse,
  QuestionSubmissionListResponse,
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

// ─── Per-problem submission lookup ──────────────────────────────────

/** Result of checking a single problem's submission history. */
export interface ProblemSolveResult {
  solved: boolean;
  /** Unix seconds of the latest accepted submission (null if unsolved) */
  latestAcceptedTimestamp: number | null;
}

const SUBMISSION_LIST_QUERY = `query submissionList(
  $offset: Int!
  $limit: Int!
  $lastKey: String
  $questionSlug: String!
) {
  questionSubmissionList(
    offset: $offset
    limit: $limit
    lastKey: $lastKey
    questionSlug: $questionSlug
  ) {
    lastKey
    hasNext
    submissions { timestamp statusDisplay }
  }
}`;

/**
 * Fetch the latest accepted timestamp for a single problem.
 *
 * Uses `questionSubmissionList` (authenticated, per-problem).
 * Fetches up to `maxPages` pages of 20 submissions each, looking
 * for the first entry where `statusDisplay === 'Accepted'`.
 *
 * Returns `{ solved: true, latestAcceptedTimestamp }` if found,
 * or `{ solved: false, latestAcceptedTimestamp: null }` if no
 * accepted submission exists within the search window.
 */
export async function fetchLatestAcceptedForProblem(
  titleSlug: string,
  maxPages = 3,
): Promise<ProblemSolveResult> {
  let offset = 0;
  let lastKey: string | null = null;
  const limit = 20;

  for (let page = 0; page < maxPages; page++) {
    const query: GraphQLQuery = {
      operationName: 'submissionList',
      query: SUBMISSION_LIST_QUERY,
      variables: { questionSlug: titleSlug, offset, limit, lastKey },
    };

    const result = await queryData<QuestionSubmissionListResponse>(
      JSON.stringify(query),
    );

    const qsl = result.data.questionSubmissionList;
    if (!qsl || qsl.submissions.length === 0) break;

    // Submissions are returned most-recent-first.
    // Find the first accepted one — that's the latest accepted timestamp.
    for (const sub of qsl.submissions) {
      if (sub.statusDisplay === 'Accepted') {
        return {
          solved: true,
          latestAcceptedTimestamp: Number(sub.timestamp),
        };
      }
    }

    if (!qsl.hasNext) break;
    offset += limit;
    lastKey = qsl.lastKey;
  }

  return { solved: false, latestAcceptedTimestamp: null };
}
