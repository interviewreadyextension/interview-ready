import type { ProblemData } from '../types/storage.types';
import { delog } from '../shared/logging';

/**
 * Fetch problems from GitHub raw file
 */

const GITHUB_BRANCH = 'feat/problem-data-sync';
const GITHUB_REPO = 'vviseguy/interview-ready-byu';
const PROBLEMS_PATH = 'data/problems.json';

export const PROBLEMS_GITHUB_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${PROBLEMS_PATH}`;

export async function fetchProblemsFromGitHub(): Promise<Omit<ProblemData, 'fetchStartedAt' | 'fetchCompletedAt' | 'lastAttemptAt' | 'timeStamp'>> {
  delog(`Fetching problems from GitHub: ${PROBLEMS_GITHUB_URL}`);
  
  const response = await fetch(PROBLEMS_GITHUB_URL, { cache: 'no-store' });
  
  if (!response.ok) {
    throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
  }
  
  const payload = await response.json();
  
  // Validate structure
  const questions = payload?.data?.problemsetQuestionList?.questions;
  if (!Array.isArray(questions)) {
    throw new Error('Problems payload missing data.problemsetQuestionList.questions');
  }
  
  delog(`Fetched ${questions.length} problems from GitHub`);
  
  return {
    ...payload,
    source: 'github' as const,
    lastError: null,
    usingCache: false,
  };
}
