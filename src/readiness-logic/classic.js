import { delog, traceMethod } from "../shared/logging.js"
import { targetTopicQuestionTarget, targetTopics } from "./target-topics.js";
import { randomElementInArray } from "./random.js";

/**
 * Classic mode readiness constants
 */
const READINESS_TARGET_UPPER_AC_RATE = 60.0;
const READINESS_TARGET_LOWER_AC_RATE = 40.0;


const getAcceptedSet = (recentAcceptedSubmissions) => {
  let recentAccepted = new Set();

  let acList = recentAcceptedSubmissions?.data?.recentAcSubmissionList;
  if (acList?.length > 0) {
    for(let item of acList) {
      recentAccepted.add(item.titleSlug);
    }
  }

  return recentAccepted;
}

/**
 * Classic readiness calculator
 */
export const getReadinessData = traceMethod(function getReadinessData(allProblems, recentAcceptedSubmissions) {
  delog(allProblems);
  delog(recentAcceptedSubmissions);

  let recentAccepted = getAcceptedSet(recentAcceptedSubmissions);

  // Build Topic Points
  let topicPoints = {};
  allProblems.data.problemsetQuestionList.questions.forEach((question) => {
    if (question.status == "ac" || recentAccepted.has(question.titleSlug)) {
      let points = .1;
      if (question.difficulty == 'Easy') {
        points = .4;
      } else if (question.difficulty == 'Medium' &&
        question.acRate >= READINESS_TARGET_UPPER_AC_RATE) {
        points = .75;
      } else if (question.difficulty == 'Medium' &&
        question.acRate < READINESS_TARGET_UPPER_AC_RATE &&
        question.acRate > READINESS_TARGET_LOWER_AC_RATE) {
        points = 1;
      } else if (question.difficulty == 'Medium') {
        points = 1.5;
      } else if (question.difficulty == 'Hard') {
        points = 2;
      }

      for (var j = 0; j < question.topicTags.length; j++) {
        var topic = question.topicTags[j].slug;
        if (!topicPoints[topic]) {
          topicPoints[topic] = 0;
        }

        topicPoints[topic] += points;
      }
    }
  });

  // Normalize and classify as ready/almost/notReady
  let readinessData = {};

  // Initialize all as not ready in case they have done no problems in that topic.
  targetTopics.forEach((topic) => {
    readinessData[topic] = ["notReady", 0.0];
  });

  Object.entries(topicPoints).forEach(element => {
    var topic = element[0];
    if (targetTopics.includes(topic)) {
      var readinessScore = element[1];
      var normalizedReadinessScore = readinessScore / targetTopicQuestionTarget[topic];
      var readinessScoreFormattedAsPercent = 100.0 * normalizedReadinessScore;

      delog(`${normalizedReadinessScore} == ${readinessScore} / ${targetTopicQuestionTarget[topic]}`)

      if (normalizedReadinessScore >= 1.0) {
        readinessData[topic] = ["ready", readinessScoreFormattedAsPercent];
      } else if (normalizedReadinessScore > .7) {
        readinessData[topic] = ["almost", readinessScoreFormattedAsPercent];
      } else {
        readinessData[topic] = ["notReady", readinessScoreFormattedAsPercent];
      }
    }
  });

  return readinessData;
});



/**
 * Get the next suggested practice problem
 */
export async function getNextPracticeProblem(topic, target) {
  const allProblems = (await chrome.storage.local.get(["problemsKey"])).problemsKey;
  const recentAccepted = getAcceptedSet((await chrome.storage.local.get(["recentSubmissionsKey"])).recentSubmissionsKey);
  const userHasPremium = (await chrome.storage.local.get(["userDataKey"])).userDataKey.isPremium;
  const unsolvedProblemsMediumMoreDifficultThanTarget = []
  const unsolvedProblemsMediumAtTarget = [];
  const unsolvedProblemsMediumEasierThanTarget = [];
  const unsolvedProblemsHard = [];
  const unsolvedProblemsEasy = [];
  const solvedByDifficulty = { "Easy": [], "Medium": [], "Hard": [] };

  const solvedProblems = []; // If they've solved everything give them a target one to repeat.
  const unsolvedProblems = [];

  

  allProblems.data.problemsetQuestionList.questions.forEach((question) => {
    let relatedToTargetTopic = question.topicTags.find(t => t.slug == topic);
    if (relatedToTargetTopic && (!question.paidOnly || userHasPremium)) {
      if (question.status != "ac" && !recentAccepted.has(question.titleSlug)) {
        unsolvedProblems.push(question.titleSlug);
        if (question.difficulty == 'Easy') {
          unsolvedProblemsEasy.push(question.titleSlug);
        } else if (question.difficulty == 'Medium' && question.acRate >= READINESS_TARGET_UPPER_AC_RATE) {
          unsolvedProblemsMediumEasierThanTarget.push(question.titleSlug);
        } else if (question.difficulty == 'Medium'
          && question.acRate < READINESS_TARGET_UPPER_AC_RATE
          && question.acRate > READINESS_TARGET_LOWER_AC_RATE) {
          unsolvedProblemsMediumAtTarget.push(question.titleSlug);
        } else if (question.difficulty == 'Medium') {
          unsolvedProblemsMediumMoreDifficultThanTarget.push(question.titleSlug)
        } else if (question.difficulty == 'Hard') {
          unsolvedProblemsHard.push(question.titleSlug)
        }
      } else {
        solvedProblems.push(question.titleSlug);
        solvedByDifficulty[question.difficulty].push(question.titleSlug);
      }
    }
  });

  const preferredElementInArray = (arr) => {
    const filteredArr = arr.filter(item => recommendedSet.has(item));
    const targetArray = filteredArr.length > 2 ? filteredArr : arr;
    return randomElementInArray(targetArray);
  }

  if (target == "easy") {
    return unsolvedProblemsEasy.length > 0 ? randomElementInArray(unsolvedProblemsEasy) : randomElementInArray(solvedByDifficulty["Easy"]);
  } else if (target == "medium") {
    if (unsolvedProblemsMediumAtTarget.length > 0) {
      return randomElementInArray(unsolvedProblemsMediumAtTarget);
    } else if (unsolvedProblemsMediumEasierThanTarget.length > 0) {
      return randomElementInArray(unsolvedProblemsMediumEasierThanTarget);
    } else if (unsolvedProblemsMediumMoreDifficultThanTarget.length > 0) {
      return randomElementInArray(unsolvedProblemsMediumMoreDifficultThanTarget);
    } else {
      return randomElementInArray(solvedByDifficulty["Medium"]);
    }
  } else if (target == "hard") {
    return unsolvedProblemsHard.length > 0 ? randomElementInArray(unsolvedProblemsHard) : randomElementInArray(solvedByDifficulty["Hard"]);
  } else if (target == "random") {
    return unsolvedProblems.length > 0 ? randomElementInArray(unsolvedProblems) : randomElementInArray(solvedProblems);
  }

  // Default "suggested" mode: progressive difficulty recommendation
  const numberOfEasyProblemsFirst = Math.min(10, unsolvedProblemsEasy.length);
  const numberOfBeforeTargetFirst = Math.min(15, unsolvedProblemsEasy.length + unsolvedProblemsMediumEasierThanTarget.length);

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
};


export const recommendedList = [
  "find-first-palindromic-string-in-the-array",
  "valid-palindrome",
  "reverse-linked-list",
  "delete-nodes-from-linked-list-present-in-array",
  "lru-cache",
  "valid-sudoku",
  "pascals-triangle",
  "split-strings-by-separator",
  "reverse-string",
  "reverse-string-ii",
  "reverse-words-in-a-string-iii",
  "decode-the-message",
  "jewels-and-stones",
  "number-of-good-pairs",
  "check-if-the-sentence-is-pangram",
  "rings-and-rods",
  "merge-nodes-in-between-zeros",
  "spiral-matrix",
  "string-compression",
  "find-the-minimum-and-maximum-number-of-nodes-between-critical-points",
  "watering-plants",
  "set-matrix-zeroes",
  "reverse-linked-list-ii",
  "brick-wall",
  "concatenation-of-array",
  "number-of-arithmetic-triplets",
  "spiral-matrix-iv",
  "zigzag-conversion",
  "binary-tree-inorder-traversal",
  "binary-tree-preorder-traversal",
  "binary-tree-postorder-traversal",
  "maximum-depth-of-binary-tree",
  "count-complete-tree-nodes",
  "search-in-a-binary-search-tree",
  "second-minimum-node-in-a-binary-tree",
  "flood-fill",
  "number-of-islands",
  "course-schedule",
  "surrounded-regions",
  "keys-and-rooms",
  "snakes-and-ladders",
  "shortest-path-with-alternating-colors",
  "shortest-path-in-a-grid-with-obstacles-elimination",
  "shortest-bridge",
  "minimum-depth-of-binary-tree",
  "count-good-nodes-in-binary-tree",
  "pacific-atlantic-water-flow",
  "shortest-path-in-binary-matrix",
  "reachable-nodes-with-restrictions",
  "number-of-operations-to-make-network-connected",
  "clone-graph",
  "path-sum-ii",
  "sum-root-to-leaf-numbers",
  "course-schedule-ii",
  "lowest-common-ancestor-of-a-binary-tree",
  "serialize-and-deserialize-binary-tree",
  "minesweeper",
  "number-of-enclaves",
  "minimum-time-to-collect-all-apples-in-a-tree",
  "maximum-binary-tree",
  "delete-nodes-and-return-forest",
  "count-nodes-with-the-highest-score",
  "most-frequent-subtree-sum",
  "path-sum-iii",
  "word-ladder",
  "coloring-a-border",
  "maximum-product-of-splitted-binary-tree",
  "path-sum",
  "fibonacci-number",
  "word-break",
  "knight-dialer",
  "number-of-dice-rolls-with-target-sum",
  "number-of-distinct-roll-sequences",
  "dice-roll-simulation",
  "n-th-tribonacci-number",
  "range-sum-query-immutable",
  "find-the-substring-with-maximum-cost",
  "divisor-game",
  "edit-distance",
  "house-robber",
  "range-sum-query-2d-immutable",
  "min-cost-climbing-stairs",
  "vowels-of-all-substrings",
  "number-of-ways-to-select-buildings",
  "coin-change",
  "how-many-numbers-are-smaller-than-the-current-number",
  "merge-sorted-array",
  "container-with-most-water",
  "merge-intervals",
  "maximum-length-of-pair-chain",
  "minimum-number-of-arrows-to-burst-balloons",
  "sort-colors",
  "sort-list",
  "largest-divisible-subset",
  "task-scheduler",
  "number-of-atoms",
  "minimum-area-rectangle",
  "search-a-2d-matrix",
  "minimum-score-by-changing-two-elements",
  "maximize-greatness-of-an-array",
  "design-a-number-container-system",
  "sort-an-array",
  "furthest-building-you-can-reach",
  "distant-barcodes",
  "number-of-steps-to-reduce-a-number-in-binary-representation-to-one",
  "binary-tree-right-side-view",
  "minimum-number-of-coins-for-fruits",
  "kth-largest-sum-in-a-binary-tree",
  "target-sum",
  "hand-of-straights",
  "number-of-matching-subsequences",
  "word-subsets",
  "removing-minimum-and-maximum-from-array",
  "populating-next-right-pointers-in-each-node-ii",
  "monotone-increasing-digits",
  "closest-nodes-queries-in-a-binary-search-tree",
  "find-good-days-to-rob-the-bank",
  "operations-on-tree",
  "count-number-of-ways-to-place-houses",
  "find-right-interval",
  "product-of-the-last-k-numbers",
  "minimum-remove-to-make-valid-parentheses",
  "word-search",
  "evaluate-the-bracket-pairs-of-a-string",
  "binary-tree-zigzag-level-order-traversal",
  "integer-break",
  "group-anagrams",
  "smallest-string-starting-from-leaf",
  "break-a-palindrome",
  "longest-univalue-path",
  "minimum-deletions-to-make-string-balanced",
  "find-three-consecutive-integers-that-sum-to-a-given-number",
  "max-sum-of-a-pair-with-equal-sum-of-digits",
  "path-with-minimum-effort",
  "populating-next-right-pointers-in-each-node",
  "ugly-number-ii",
  "coin-change-ii",
  "unique-binary-search-trees",
  "sum-of-distances",
  "alert-using-same-key-card-three-or-more-times-in-a-one-hour-period",
  "largest-plus-sign",
  "minimum-sideway-jumps",
  "boats-to-save-people",
  "course-schedule-iv",
  "insufficient-nodes-in-root-to-leaf-paths",
  "majority-element-ii"
];

const recommendedSet = new Set(recommendedList);