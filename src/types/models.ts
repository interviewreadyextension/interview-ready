/**
 * Core problem model from LeetCode
 */
export interface Problem {
  acRate: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  frontendQuestionId: string;
  isFavor: boolean;
  paidOnly: boolean;
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

/**
 * Accepted submission model
 */
export interface AcceptedSubmission {
  id: string;
  title: string;
  titleSlug: string;
  timestamp: string; // Unix timestamp as string
}

/**
 * User status from LeetCode
 */
export interface UserStatus {
  isSignedIn: boolean;
  isPremium: boolean;
  username: string;
  realName?: string;
  avatar?: string;
}

/**
 * Readiness score model
 */
export interface TopicReadiness {
  topic: string;
  solved: number;
  target: number;
  percentage: number;
  status: 'ready' | 'almost' | 'not-ready';
}

export interface ReadinessData {
  topics: TopicReadiness[];
  overall: {
    ready: number;
    almost: number;
    notReady: number;
  };
}

/**
 * Practice problem selection modes
 */
export type PracticeMode = 'suggested' | 'review' | 'random';
