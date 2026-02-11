/**
 * Readiness logic — pure functions that compute interview readiness.
 *
 * Given the problem catalog and submission cache, this module:
 *   - Computes per-topic readiness scores (ready / almost / notReady)
 *   - Determines available practice problems per difficulty
 *   - Suggests the next best problem to solve for each topic
 *   - Provides "big button" practice modes (suggested, review, random)
 *
 * All functions are pure (no side effects, no Chrome API calls) and
 * testable in isolation.  The popup passes in data it already has.
 * Date-range filtering is supported throughout so the popup can show
 * readiness scoped to 7d / 30d / 120d / all-time windows.
 */

import type { Problem } from '../types/models';
import type { ProblemData, SubmissionCacheData } from '../types/storage.types';

// ─── Configuration ──────────────────────────────────────────────────

export const TARGET_TOPIC_COUNTS: Record<string, number> = {
  'hash-table': 20,
  'string': 20,
  'linked-list': 12,
  'array': 24,
  'depth-first-search': 12,
  'breadth-first-search': 10,
  'binary-search': 7,
  'dynamic-programming': 14,
  'sorting': 10,
  'heap-priority-queue': 6,
  'queue': 5,
};

export const TARGET_TOPICS = [
  'hash-table', 'string', 'linked-list', 'array',
  'depth-first-search', 'breadth-first-search', 'binary-search',
  'dynamic-programming', 'sorting', 'heap-priority-queue', 'queue',
] as const;

const UPPER_AC_RATE = 60.0;
const LOWER_AC_RATE = 40.0;

// ─── Types ──────────────────────────────────────────────────────────

export type ReadinessStatus = 'ready' | 'almost' | 'notReady';
export type ReadinessData = Record<string, [ReadinessStatus, number]>;
export type PracticeTarget = 'suggested' | 'easy' | 'medium' | 'hard' | 'random';
export type BigPracticeMode = 'suggested' | 'review' | 'random';

export interface DateRange {
  startSec: number;
  endSec: number;
}

export interface TopicAvailability {
  suggested: { total: number; unsolved: number };
  easy: { total: number; unsolved: number };
  medium: { total: number; unsolved: number };
  hard: { total: number; unsolved: number };
  random: { total: number; unsolved: number };
}

export interface BigButtonStates {
  suggested: { hasUnsolved: boolean; label: string; done: number; total: number };
  review: { enabled: boolean; label: string };
  random: { hasUnsolved: boolean; label: string };
}

// ─── Core helpers ───────────────────────────────────────────────────

/**
 * Build a set of accepted problem slugs from the submission cache.
 * When `dateRange` is provided, only entries with timestamps in range count.
 */
export function buildAcceptedSet(
  cache?: SubmissionCacheData,
  dateRange?: DateRange,
): Set<string> {
  const accepted = new Set<string>();
  if (!cache?.entries) return accepted;

  for (const [slug, entry] of Object.entries(cache.entries)) {
    if (!entry.solved) continue;
    if (dateRange) {
      if (entry.latestAcceptedTimestamp === null) continue;
      if (entry.latestAcceptedTimestamp < dateRange.startSec
        || entry.latestAcceptedTimestamp > dateRange.endSec) continue;
    }
    accepted.add(slug);
  }
  return accepted;
}

/**
 * Check if a problem is "solved" in the current context.
 *
 * Uses the cache-derived accepted set first, then falls back to
 * `question.status === 'ac'` when no date filter is active and no
 * cache entry exists yet (the status field has no timestamp).
 */
function isSolved(
  slug: string,
  status: string | null,
  accepted: Set<string>,
  allowStatusFallback: boolean,
  cacheEntries: Record<string, unknown>,
): boolean {
  return accepted.has(slug)
    || (allowStatusFallback && status === 'ac' && !(slug in cacheEntries));
}

export function randomElementInArray<T>(arr: T[]): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Points for a solved problem based on difficulty and acceptance rate.
 * Harder problems are worth more points toward readiness.
 */
function solvedPoints(q: Problem): number {
  if (q.difficulty === 'Easy') return 0.4;
  if (q.difficulty === 'Hard') return 2;
  // Medium — graduated by acceptance rate
  if (q.acRate >= UPPER_AC_RATE) return 0.75;
  if (q.acRate > LOWER_AC_RATE) return 1;
  return 1.5;
}

// ─── Readiness calculation ──────────────────────────────────────────

export function getReadinessData(
  allProblems: ProblemData,
  submissionCache?: SubmissionCacheData,
  dateRange?: DateRange,
): ReadinessData {
  const accepted = buildAcceptedSet(submissionCache, dateRange);
  const allowFallback = !dateRange;
  const entries = submissionCache?.entries ?? {};

  // Accumulate points per topic
  const topicPoints: Record<string, number> = {};
  for (const q of allProblems.data.problemsetQuestionList.questions) {
    if (!isSolved(q.titleSlug, q.status, accepted, allowFallback, entries)) continue;
    const pts = solvedPoints(q);
    for (const tag of q.topicTags) {
      topicPoints[tag.slug] = (topicPoints[tag.slug] ?? 0) + pts;
    }
  }

  // Normalize into readiness statuses
  const data: ReadinessData = {};
  for (const topic of TARGET_TOPICS) {
    const normalized = (topicPoints[topic] ?? 0) / TARGET_TOPIC_COUNTS[topic];
    const pct = normalized * 100;
    const status: ReadinessStatus =
      normalized >= 1.0 ? 'ready' : normalized > 0.7 ? 'almost' : 'notReady';
    data[topic] = [status, pct];
  }
  return data;
}

// ─── Recommended problem list ───────────────────────────────────────

export const recommendedList: string[] = [
  'find-first-palindromic-string-in-the-array',
  'valid-palindrome',
  'reverse-linked-list',
  'delete-nodes-from-linked-list-present-in-array',
  'lru-cache',
  'valid-sudoku',
  'pascals-triangle',
  'split-strings-by-separator',
  'reverse-string',
  'reverse-string-ii',
  'reverse-words-in-a-string-iii',
  'decode-the-message',
  'jewels-and-stones',
  'number-of-good-pairs',
  'check-if-the-sentence-is-pangram',
  'rings-and-rods',
  'merge-nodes-in-between-zeros',
  'spiral-matrix',
  'string-compression',
  'find-the-minimum-and-maximum-number-of-nodes-between-critical-points',
  'watering-plants',
  'set-matrix-zeroes',
  'reverse-linked-list-ii',
  'brick-wall',
  'concatenation-of-array',
  'number-of-arithmetic-triplets',
  'spiral-matrix-iv',
  'zigzag-conversion',
  'binary-tree-inorder-traversal',
  'binary-tree-preorder-traversal',
  'binary-tree-postorder-traversal',
  'maximum-depth-of-binary-tree',
  'count-complete-tree-nodes',
  'search-in-a-binary-search-tree',
  'second-minimum-node-in-a-binary-tree',
  'flood-fill',
  'number-of-islands',
  'course-schedule',
  'surrounded-regions',
  'keys-and-rooms',
  'snakes-and-ladders',
  'shortest-path-with-alternating-colors',
  'shortest-path-in-a-grid-with-obstacles-elimination',
  'shortest-bridge',
  'minimum-depth-of-binary-tree',
  'count-good-nodes-in-binary-tree',
  'pacific-atlantic-water-flow',
  'shortest-path-in-binary-matrix',
  'reachable-nodes-with-restrictions',
  'number-of-operations-to-make-network-connected',
  'clone-graph',
  'path-sum-ii',
  'sum-root-to-leaf-numbers',
  'course-schedule-ii',
  'lowest-common-ancestor-of-a-binary-tree',
  'serialize-and-deserialize-binary-tree',
  'minesweeper',
  'number-of-enclaves',
  'minimum-time-to-collect-all-apples-in-a-tree',
  'maximum-binary-tree',
  'delete-nodes-and-return-forest',
  'count-nodes-with-the-highest-score',
  'most-frequent-subtree-sum',
  'path-sum-iii',
  'word-ladder',
  'coloring-a-border',
  'maximum-product-of-splitted-binary-tree',
  'path-sum',
  'fibonacci-number',
  'word-break',
  'knight-dialer',
  'number-of-dice-rolls-with-target-sum',
  'number-of-distinct-roll-sequences',
  'dice-roll-simulation',
  'n-th-tribonacci-number',
  'range-sum-query-immutable',
  'find-the-substring-with-maximum-cost',
  'divisor-game',
  'edit-distance',
  'house-robber',
  'range-sum-query-2d-immutable',
  'min-cost-climbing-stairs',
  'vowels-of-all-substrings',
  'number-of-ways-to-select-buildings',
  'coin-change',
  'how-many-numbers-are-smaller-than-the-current-number',
  'merge-sorted-array',
  'container-with-most-water',
  'merge-intervals',
  'maximum-length-of-pair-chain',
  'minimum-number-of-arrows-to-burst-balloons',
  'sort-colors',
  'sort-list',
  'largest-divisible-subset',
  'task-scheduler',
  'number-of-atoms',
  'minimum-area-rectangle',
  'search-a-2d-matrix',
  'minimum-score-by-changing-two-elements',
  'maximize-greatness-of-an-array',
  'design-a-number-container-system',
  'sort-an-array',
  'furthest-building-you-can-reach',
  'distant-barcodes',
  'number-of-steps-to-reduce-a-number-in-binary-representation-to-one',
  'binary-tree-right-side-view',
  'minimum-number-of-coins-for-fruits',
  'kth-largest-sum-in-a-binary-tree',
  'target-sum',
  'hand-of-straights',
  'number-of-matching-subsequences',
  'word-subsets',
  'removing-minimum-and-maximum-from-array',
  'populating-next-right-pointers-in-each-node-ii',
  'monotone-increasing-digits',
  'closest-nodes-queries-in-a-binary-search-tree',
  'find-good-days-to-rob-the-bank',
  'operations-on-tree',
  'count-number-of-ways-to-place-houses',
  'find-right-interval',
  'product-of-the-last-k-numbers',
  'minimum-remove-to-make-valid-parentheses',
  'word-search',
  'evaluate-the-bracket-pairs-of-a-string',
  'binary-tree-zigzag-level-order-traversal',
  'integer-break',
  'group-anagrams',
  'smallest-string-starting-from-leaf',
  'break-a-palindrome',
  'longest-univalue-path',
  'minimum-deletions-to-make-string-balanced',
  'find-three-consecutive-integers-that-sum-to-a-given-number',
  'max-sum-of-a-pair-with-equal-sum-of-digits',
  'path-with-minimum-effort',
  'populating-next-right-pointers-in-each-node',
  'ugly-number-ii',
  'coin-change-ii',
  'unique-binary-search-trees',
  'sum-of-distances',
  'alert-using-same-key-card-three-or-more-times-in-a-one-hour-period',
  'largest-plus-sign',
  'minimum-sideway-jumps',
  'boats-to-save-people',
  'course-schedule-iv',
  'insufficient-nodes-in-root-to-leaf-paths',
  'majority-element-ii',
];

export const recommendedSet = new Set(recommendedList);

// ─── Problem classification ─────────────────────────────────────────

interface ClassifiedProblems {
  unsolved: {
    easy: string[];
    medEasy: string[];   // acRate >= UPPER_AC_RATE
    medTarget: string[]; // LOWER_AC_RATE < acRate < UPPER_AC_RATE
    medHard: string[];   // acRate <= LOWER_AC_RATE
    hard: string[];
    all: string[];
  };
  solved: {
    easy: string[];
    medium: string[];
    hard: string[];
    all: string[];
  };
}

/**
 * Classify problems for a topic into solved/unsolved difficulty buckets.
 */
function classifyProblems(
  questions: Problem[],
  topic: string,
  accepted: Set<string>,
  isPremium: boolean,
): ClassifiedProblems {
  const unsolved = { easy: [] as string[], medEasy: [] as string[], medTarget: [] as string[], medHard: [] as string[], hard: [] as string[], all: [] as string[] };
  const solved = { easy: [] as string[], medium: [] as string[], hard: [] as string[], all: [] as string[] };

  for (const q of questions) {
    if (!q.topicTags.some(t => t.slug === topic)) continue;
    if (q.paidOnly && !isPremium) continue;

    if (accepted.has(q.titleSlug)) {
      solved.all.push(q.titleSlug);
      const key = q.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard';
      solved[key].push(q.titleSlug);
    } else {
      unsolved.all.push(q.titleSlug);
      if (q.difficulty === 'Easy') unsolved.easy.push(q.titleSlug);
      else if (q.difficulty === 'Hard') unsolved.hard.push(q.titleSlug);
      else if (q.acRate >= UPPER_AC_RATE) unsolved.medEasy.push(q.titleSlug);
      else if (q.acRate > LOWER_AC_RATE) unsolved.medTarget.push(q.titleSlug);
      else unsolved.medHard.push(q.titleSlug);
    }
  }

  return { unsolved, solved };
}

// ─── Practice problem selection ─────────────────────────────────────

/** Pick from `arr`, preferring items in the recommended set. */
function preferRecommended(arr: string[]): string | null {
  const preferred = arr.filter(s => recommendedSet.has(s));
  return randomElementInArray(preferred.length > 2 ? preferred : arr);
}

/**
 * Get the next practice problem for a given topic and difficulty target.
 * Pure — caller provides all required data.
 */
export function getNextPracticeProblem(
  topic: string,
  target: PracticeTarget,
  problems: Problem[],
  cache: SubmissionCacheData | undefined,
  isPremium: boolean,
  dateRange?: DateRange,
): string | null {
  const accepted = buildAcceptedSet(cache, dateRange);
  const { unsolved, solved } = classifyProblems(problems, topic, accepted, isPremium);

  switch (target) {
    case 'easy':
      return randomElementInArray(unsolved.easy) ?? randomElementInArray(solved.easy);
    case 'medium':
      return randomElementInArray(unsolved.medTarget)
        ?? randomElementInArray(unsolved.medEasy)
        ?? randomElementInArray(unsolved.medHard)
        ?? randomElementInArray(solved.medium);
    case 'hard':
      return randomElementInArray(unsolved.hard) ?? randomElementInArray(solved.hard);
    case 'random':
      return randomElementInArray(unsolved.all) ?? randomElementInArray(solved.all);
    default: // 'suggested'
      break;
  }

  // Suggested mode: progressive difficulty
  const easyFirst = Math.min(10, unsolved.easy.length);
  const beforeTarget = Math.min(15, unsolved.easy.length + unsolved.medEasy.length);

  if (easyFirst > solved.all.length) return preferRecommended(unsolved.easy);
  if (beforeTarget > solved.all.length) return preferRecommended(unsolved.medEasy);

  return preferRecommended(unsolved.medTarget)
    ?? preferRecommended(unsolved.medEasy)
    ?? preferRecommended(unsolved.medHard)
    ?? preferRecommended(unsolved.hard)
    ?? preferRecommended(unsolved.easy)
    ?? preferRecommended(solved.all);
}

/**
 * Get a practice problem by high-level mode (suggested / review / random).
 * Pure — caller provides all required data.
 */
export function getPracticeProblem(
  practiceType: BigPracticeMode,
  problems: ProblemData,
  cache: SubmissionCacheData | undefined,
  isPremium: boolean,
  dateRange?: DateRange,
): string | null {
  const accepted = buildAcceptedSet(cache, dateRange);
  const allowFallback = !dateRange;
  const entries = cache?.entries ?? {};
  const questions = problems.data.problemsetQuestionList.questions;

  if (practiceType === 'suggested') {
    // First: find the next unfinished recommended problem
    const bySlug = new Map(questions.map(q => [q.titleSlug, q]));
    for (const slug of recommendedList) {
      const q = bySlug.get(slug);
      if (q && !isSolved(slug, q.status, accepted, allowFallback, entries)) {
        return slug;
      }
    }
    // All recommended done — find first non-ready topic
    const readiness = getReadinessData(problems, cache, dateRange);
    for (const topic of TARGET_TOPICS) {
      if (readiness[topic][0] !== 'ready') {
        return getNextPracticeProblem(topic, 'suggested', questions, cache, isPremium, dateRange);
      }
    }
  } else if (practiceType === 'review') {
    const solvedList = questions
      .filter(q =>
        isSolved(q.titleSlug, q.status, accepted, allowFallback, entries)
        && q.topicTags?.some(t => TARGET_TOPICS.includes(t.slug as (typeof TARGET_TOPICS)[number]))
      )
      .map(q => q.titleSlug);
    return randomElementInArray(solvedList);
  } else if (practiceType === 'random') {
    const topic = randomElementInArray([...TARGET_TOPICS]) ?? TARGET_TOPICS[0];
    return getNextPracticeProblem(topic, 'suggested', questions, cache, isPremium, dateRange);
  }

  return null;
}

// ─── Topic availability (for button states) ─────────────────────────

export function computeTopicAvailability(
  questions: Problem[],
  accepted: Set<string>,
  isPremium: boolean,
  dateRange?: DateRange,
  cacheEntries?: Record<string, { solved: boolean }>,
): Record<string, TopicAvailability> {
  const avail: Record<string, TopicAvailability> = {};
  for (const topic of TARGET_TOPICS) {
    avail[topic] = {
      suggested: { total: 0, unsolved: 0 },
      easy: { total: 0, unsolved: 0 },
      medium: { total: 0, unsolved: 0 },
      hard: { total: 0, unsolved: 0 },
      random: { total: 0, unsolved: 0 },
    };
  }
  if (!questions) return avail;

  const allowFallback = !dateRange;
  const entries = cacheEntries ?? {};

  for (const q of questions) {
    if (q.paidOnly && !isPremium) continue;
    const solved = isSolved(q.titleSlug, q.status, accepted, allowFallback, entries);

    for (const tag of q.topicTags || []) {
      const a = avail[tag.slug];
      if (!a) continue;

      const diff = q.difficulty?.toLowerCase() as 'easy' | 'medium' | 'hard';
      if (diff === 'easy' || diff === 'medium' || diff === 'hard') {
        a[diff].total++;
        if (!solved) a[diff].unsolved++;
      }
      a.suggested.total++;
      if (!solved) a.suggested.unsolved++;
      a.random.total++;
      if (!solved) a.random.unsolved++;
    }
  }
  return avail;
}

export function computeBigButtonStates(
  questions: Problem[],
  accepted: Set<string>,
  isPremium: boolean,
  dateRange?: DateRange,
  cacheEntries?: Record<string, { solved: boolean }>,
): BigButtonStates {
  const states: BigButtonStates = {
    suggested: { hasUnsolved: false, label: 'Next Suggested Problem', done: 0, total: 0 },
    review: { enabled: false, label: 'Review Random Completed' },
    random: { hasUnsolved: true, label: 'Solve Random Problem' },
  };
  if (!questions) return states;

  const allowFallback = !dateRange;
  const entries = cacheEntries ?? {};
  const bySlug = new Map(questions.map(q => [q.titleSlug, q]));

  // Count suggested-list progress
  let suggestedTotal = 0;
  let suggestedDone = 0;
  for (const slug of recommendedList) {
    const q = bySlug.get(slug);
    if (!q || (q.paidOnly && !isPremium)) continue;
    suggestedTotal++;
    if (isSolved(slug, q.status, accepted, allowFallback, entries)) {
      suggestedDone++;
    } else {
      states.suggested.hasUnsolved = true;
    }
  }
  states.suggested.done = suggestedDone;
  states.suggested.total = suggestedTotal;
  if (states.suggested.hasUnsolved) {
    states.suggested.label = `Next Suggested Problem (${suggestedDone}/${suggestedTotal})`;
  } else {
    states.suggested.label = 'Solve Random Problem';
  }

  // Check review availability
  for (const q of questions) {
    if (q.paidOnly && !isPremium) continue;
    if (!q.topicTags?.some(t => TARGET_TOPICS.includes(t.slug as (typeof TARGET_TOPICS)[number]))) continue;
    if (isSolved(q.titleSlug, q.status, accepted, allowFallback, entries)) {
      states.review.enabled = true;
      break;
    }
  }

  return states;
}
