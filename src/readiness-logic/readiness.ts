import type { Problem } from '../types/models';
import type { ProblemData, SubmissionData } from '../types/storage.types';

/**
 * Target question counts per topic
 */
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
  'hash-table',
  'string',
  'linked-list',
  'array',
  'depth-first-search',
  'breadth-first-search',
  'binary-search',
  'dynamic-programming',
  'sorting',
  'heap-priority-queue',
  'queue',
] as const;

const READINESS_TARGET_UPPER_AC_RATE = 60.0;
const READINESS_TARGET_LOWER_AC_RATE = 40.0;

export type ReadinessStatus = 'ready' | 'almost' | 'notReady';

export interface TopicReadiness {
  topic: string;
  status: ReadinessStatus;
  percentage: number;
}

export type ReadinessData = Record<string, [ReadinessStatus, number]>;

/**
 * Date range for filtering which solved problems count toward readiness.
 * Timestamps are Unix seconds (matching LeetCode's submission timestamps).
 */
export interface DateRange {
  startSec: number;
  endSec: number;
}

/**
 * Build a set of accepted problem slugs from submissions.
 *
 * When `dateRange` is provided, only submissions whose timestamp falls
 * within [startSec, endSec] are included.
 */
export function buildAcceptedSet(
  submissions?: SubmissionData,
  dateRange?: DateRange,
): Set<string> {
  const accepted = new Set<string>();
  const acList = submissions?.data?.recentAcSubmissionList;
  if (acList?.length) {
    for (const item of acList) {
      if (dateRange) {
        const ts = Number(item.timestamp);
        if (ts < dateRange.startSec || ts > dateRange.endSec) continue;
      }
      accepted.add(item.titleSlug);
    }
  }
  return accepted;
}

/**
 * Calculate readiness data for all target topics.
 * When `dateRange` is provided, only problems solved within that range count.
 */
export function getReadinessData(
  allProblems: ProblemData,
  recentAcceptedSubmissions?: SubmissionData,
  dateRange?: DateRange,
): ReadinessData {
  const recentAccepted = buildAcceptedSet(recentAcceptedSubmissions, dateRange);

  // When a date range filter is active, ignore `question.status` from LeetCode
  // (it has no timestamp) and rely solely on the date-filtered accepted set.
  const useStatusField = !dateRange;

  // Build Topic Points
  const topicPoints: Record<string, number> = {};

  allProblems.data.problemsetQuestionList.questions.forEach((question) => {
    if ((useStatusField && question.status === 'ac') || recentAccepted.has(question.titleSlug)) {
      let points = 0.1;
      if (question.difficulty === 'Easy') {
        points = 0.4;
      } else if (
        question.difficulty === 'Medium' &&
        question.acRate >= READINESS_TARGET_UPPER_AC_RATE
      ) {
        points = 0.75;
      } else if (
        question.difficulty === 'Medium' &&
        question.acRate < READINESS_TARGET_UPPER_AC_RATE &&
        question.acRate > READINESS_TARGET_LOWER_AC_RATE
      ) {
        points = 1;
      } else if (question.difficulty === 'Medium') {
        points = 1.5;
      } else if (question.difficulty === 'Hard') {
        points = 2;
      }

      for (const tag of question.topicTags) {
        const topic = tag.slug;
        if (!topicPoints[topic]) {
          topicPoints[topic] = 0;
        }
        topicPoints[topic] += points;
      }
    }
  });

  // Normalize and classify
  const readinessData: ReadinessData = {};

  // Initialize all target topics as not ready
  TARGET_TOPICS.forEach((topic) => {
    readinessData[topic] = ['notReady', 0.0];
  });

  Object.entries(topicPoints).forEach(([topic, readinessScore]) => {
    if (TARGET_TOPICS.includes(topic as (typeof TARGET_TOPICS)[number])) {
      const normalizedReadinessScore = readinessScore / TARGET_TOPIC_COUNTS[topic];
      const readinessScoreFormattedAsPercent = 100.0 * normalizedReadinessScore;

      if (normalizedReadinessScore >= 1.0) {
        readinessData[topic] = ['ready', readinessScoreFormattedAsPercent];
      } else if (normalizedReadinessScore > 0.7) {
        readinessData[topic] = ['almost', readinessScoreFormattedAsPercent];
      } else {
        readinessData[topic] = ['notReady', readinessScoreFormattedAsPercent];
      }
    }
  });

  return readinessData;
}

/**
 * Random element from array
 */
export function randomElementInArray<T>(arr: T[]): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Recommended problem list
 */
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

export type PracticeTarget = 'suggested' | 'easy' | 'medium' | 'hard' | 'random';

/**
 * Get the next practice problem for a given topic and difficulty target.
 *
 * Reads problem + submission data from chrome.storage.local directly
 * so the popup can call this without prop-drilling all data.
 */
export async function getNextPracticeProblem(
  topic: string,
  target: PracticeTarget
): Promise<string | null> {
  const allProblems = (await chrome.storage.local.get(['problemsKey'])).problemsKey as ProblemData;
  const recentAccepted = buildAcceptedSet(
    (await chrome.storage.local.get(['recentSubmissionsKey'])).recentSubmissionsKey as SubmissionData | undefined,
  );
  const userHasPremium = (
    (await chrome.storage.local.get(['userDataKey'])).userDataKey as { isPremium?: boolean } | undefined
  )?.isPremium;

  const unsolvedProblemsMediumMoreDifficultThanTarget: string[] = [];
  const unsolvedProblemsMediumAtTarget: string[] = [];
  const unsolvedProblemsMediumEasierThanTarget: string[] = [];
  const unsolvedProblemsHard: string[] = [];
  const unsolvedProblemsEasy: string[] = [];
  const solvedByDifficulty: Record<string, string[]> = { Easy: [], Medium: [], Hard: [] };
  const solvedProblems: string[] = [];
  const unsolvedProblems: string[] = [];

  allProblems.data.problemsetQuestionList.questions.forEach((question) => {
    const relatedToTargetTopic = question.topicTags.find((t) => t.slug === topic);
    if (relatedToTargetTopic && (!question.paidOnly || userHasPremium)) {
      if (question.status !== 'ac' && !recentAccepted.has(question.titleSlug)) {
        unsolvedProblems.push(question.titleSlug);
        if (question.difficulty === 'Easy') {
          unsolvedProblemsEasy.push(question.titleSlug);
        } else if (
          question.difficulty === 'Medium' &&
          question.acRate >= READINESS_TARGET_UPPER_AC_RATE
        ) {
          unsolvedProblemsMediumEasierThanTarget.push(question.titleSlug);
        } else if (
          question.difficulty === 'Medium' &&
          question.acRate < READINESS_TARGET_UPPER_AC_RATE &&
          question.acRate > READINESS_TARGET_LOWER_AC_RATE
        ) {
          unsolvedProblemsMediumAtTarget.push(question.titleSlug);
        } else if (question.difficulty === 'Medium') {
          unsolvedProblemsMediumMoreDifficultThanTarget.push(question.titleSlug);
        } else if (question.difficulty === 'Hard') {
          unsolvedProblemsHard.push(question.titleSlug);
        }
      } else {
        solvedProblems.push(question.titleSlug);
        if (solvedByDifficulty[question.difficulty]) {
          solvedByDifficulty[question.difficulty].push(question.titleSlug);
        }
      }
    }
  });

  const preferredElementInArray = (arr: string[]): string | null => {
    const filteredArr = arr.filter((item) => recommendedSet.has(item));
    const targetArray = filteredArr.length > 2 ? filteredArr : arr;
    return randomElementInArray(targetArray);
  };

  if (target === 'easy') {
    return unsolvedProblemsEasy.length > 0
      ? randomElementInArray(unsolvedProblemsEasy)
      : randomElementInArray(solvedByDifficulty['Easy']);
  } else if (target === 'medium') {
    if (unsolvedProblemsMediumAtTarget.length > 0) {
      return randomElementInArray(unsolvedProblemsMediumAtTarget);
    } else if (unsolvedProblemsMediumEasierThanTarget.length > 0) {
      return randomElementInArray(unsolvedProblemsMediumEasierThanTarget);
    } else if (unsolvedProblemsMediumMoreDifficultThanTarget.length > 0) {
      return randomElementInArray(unsolvedProblemsMediumMoreDifficultThanTarget);
    } else {
      return randomElementInArray(solvedByDifficulty['Medium']);
    }
  } else if (target === 'hard') {
    return unsolvedProblemsHard.length > 0
      ? randomElementInArray(unsolvedProblemsHard)
      : randomElementInArray(solvedByDifficulty['Hard']);
  } else if (target === 'random') {
    return unsolvedProblems.length > 0
      ? randomElementInArray(unsolvedProblems)
      : randomElementInArray(solvedProblems);
  }

  // Default "suggested" mode: progressive difficulty recommendation
  const numberOfEasyProblemsFirst = Math.min(10, unsolvedProblemsEasy.length);
  const numberOfBeforeTargetFirst = Math.min(
    15,
    unsolvedProblemsEasy.length + unsolvedProblemsMediumEasierThanTarget.length
  );

  if (numberOfEasyProblemsFirst > solvedProblems.length) {
    return preferredElementInArray(unsolvedProblemsEasy);
  } else if (numberOfBeforeTargetFirst > solvedProblems.length) {
    return preferredElementInArray(unsolvedProblemsMediumEasierThanTarget);
  }

  if (unsolvedProblemsMediumAtTarget.length > 0) {
    return preferredElementInArray(unsolvedProblemsMediumAtTarget);
  } else if (unsolvedProblemsMediumEasierThanTarget.length > 0) {
    return preferredElementInArray(unsolvedProblemsMediumEasierThanTarget);
  } else if (unsolvedProblemsMediumMoreDifficultThanTarget.length > 0) {
    return preferredElementInArray(unsolvedProblemsMediumMoreDifficultThanTarget);
  } else if (unsolvedProblemsHard.length > 0) {
    return preferredElementInArray(unsolvedProblemsHard);
  } else if (unsolvedProblemsEasy.length > 0) {
    return preferredElementInArray(unsolvedProblemsEasy);
  }

  return preferredElementInArray(solvedProblems);
}

export type BigPracticeMode = 'suggested' | 'review' | 'random';

/**
 * Get a practice problem by high-level mode (suggested / review / random).
 *
 * Reads from chrome.storage.local directly — the popup calls this
 * as a one-shot action when the user clicks a button.
 */
export async function getPracticeProblem(
  practiceType: BigPracticeMode
): Promise<string | null> {
  const allProblems = (await chrome.storage.local.get(['problemsKey'])).problemsKey as ProblemData;
  const { recentSubmissionsKey: recentAcceptedData } = await chrome.storage.local.get(['recentSubmissionsKey']) as { recentSubmissionsKey?: SubmissionData };
  const recentAcceptedSet = buildAcceptedSet(recentAcceptedData);

  if (practiceType === 'suggested') {
    const acceptedSet = new Set<string>();
    allProblems.data.problemsetQuestionList.questions.forEach((question) => {
      if (question.status === 'ac' || recentAcceptedSet.has(question.titleSlug)) {
        acceptedSet.add(question.titleSlug);
      }
    });

    for (const slug of recommendedList) {
      if (!acceptedSet.has(slug)) {
        return slug;
      }
    }

    const readinessData = getReadinessData(allProblems, recentAcceptedData);

    for (const topic of TARGET_TOPICS) {
      if (readinessData[topic][0] !== 'ready') {
        return await getNextPracticeProblem(topic, 'suggested');
      }
    }
  } else if (practiceType === 'review') {
    const acceptedList: string[] = [];
    allProblems.data.problemsetQuestionList.questions.forEach((question) => {
      if (question.status === 'ac' || recentAcceptedSet.has(question.titleSlug)) {
        acceptedList.push(question.titleSlug);
      }
    });

    if (acceptedList.length === 0) return null;
    return randomElementInArray(acceptedList);
  } else if (practiceType === 'random') {
    const randomTopic = randomElementInArray([...TARGET_TOPICS]) ?? TARGET_TOPICS[0];
    return getNextPracticeProblem(randomTopic, 'suggested');
  }

  return null;
}

/**
 * Topic availability data for button state
 */
export interface TopicAvailability {
  suggested: { total: number; unsolved: number };
  easy: { total: number; unsolved: number };
  medium: { total: number; unsolved: number };
  hard: { total: number; unsolved: number };
  random: { total: number; unsolved: number };
}

/**
 * Compute availability of problems by topic and difficulty
 */
export function computeTopicAvailability(
  questions: Problem[],
  recentAccepted: Set<string>,
  userHasPremium: boolean,
  dateRange?: DateRange,
): Record<string, TopicAvailability> {
  const availability: Record<string, TopicAvailability> = {};

  for (const topic of TARGET_TOPICS) {
    availability[topic] = {
      suggested: { total: 0, unsolved: 0 },
      easy: { total: 0, unsolved: 0 },
      medium: { total: 0, unsolved: 0 },
      hard: { total: 0, unsolved: 0 },
      random: { total: 0, unsolved: 0 },
    };
  }

  if (!questions) return availability;

  const useStatusField = !dateRange;

  for (const q of questions) {
    if (q.paidOnly && !userHasPremium) continue;

    const solved = (useStatusField && q.status === 'ac') || recentAccepted.has(q.titleSlug);

    for (const tag of q.topicTags || []) {
      const topic = tag.slug;
      if (!availability[topic]) continue;

      const diff = q.difficulty?.toLowerCase() as 'easy' | 'medium' | 'hard';
      if (diff === 'easy' || diff === 'medium' || diff === 'hard') {
        availability[topic][diff].total++;
        if (!solved) availability[topic][diff].unsolved++;
      }

      availability[topic].suggested.total++;
      if (!solved) availability[topic].suggested.unsolved++;

      availability[topic].random.total++;
      if (!solved) availability[topic].random.unsolved++;
    }
  }

  return availability;
}

/**
 * Big button states
 */
export interface BigButtonStates {
  suggested: { hasUnsolved: boolean; label: string };
  review: { enabled: boolean; label: string };
  random: { hasUnsolved: boolean; label: string };
}

export function computeBigButtonStates(
  questions: Problem[],
  recentAccepted: Set<string>,
  userHasPremium: boolean,
  dateRange?: DateRange,
): BigButtonStates {
  const states: BigButtonStates = {
    suggested: { hasUnsolved: false, label: 'Next Suggested Problem' },
    review: { enabled: false, label: 'Review Random Completed' },
    random: { hasUnsolved: true, label: 'Solve Random Problem' },
  };

  if (!questions) return states;

  const useStatusField = !dateRange;

  // Check suggested list
  const bySlug = new Map<string, Problem>();
  for (const q of questions) {
    bySlug.set(q.titleSlug, q);
  }

  for (const slug of recommendedList) {
    const q = bySlug.get(slug);
    if (!q) continue;
    if (q.paidOnly && !userHasPremium) continue;
    const solved = (useStatusField && q.status === 'ac') || recentAccepted.has(slug);
    if (!solved) {
      states.suggested.hasUnsolved = true;
      break;
    }
  }

  if (!states.suggested.hasUnsolved) {
    states.suggested.label = 'Solve Random Problem';
  }

  // Check review
  for (const q of questions) {
    if (q.paidOnly && !userHasPremium) continue;
    const inTargetTopics = q.topicTags?.some((t) =>
      TARGET_TOPICS.includes(t.slug as (typeof TARGET_TOPICS)[number])
    );
    if (!inTargetTopics) continue;
    const solved = (useStatusField && q.status === 'ac') || recentAccepted.has(q.titleSlug);
    if (solved) {
      states.review.enabled = true;
      break;
    }
  }

  return states;
}
