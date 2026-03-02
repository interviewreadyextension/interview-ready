import { recommendedList, recommendedSet } from './recommended-list.rip';
let LOWER_AC_RATE, UPPER_AC_RATE, classifyProblems, isSolved, solvedPoints;

export const TARGET_TOPIC_COUNTS = {'hash-table': 20, 'string': 20, 'linked-list': 12, 'array': 24, 'depth-first-search': 12, 'breadth-first-search': 10, 'binary-search': 7, 'dynamic-programming': 14, 'sorting': 10, 'heap-priority-queue': 6, 'queue': 5};
export const TARGET_TOPICS = ['hash-table', 'string', 'linked-list', 'array', 'depth-first-search', 'breadth-first-search', 'binary-search', 'dynamic-programming', 'sorting', 'heap-priority-queue', 'queue'];
UPPER_AC_RATE = 60.0;
LOWER_AC_RATE = 40.0;
export const buildAcceptedSet = (function(cache, dateRange) {
  let accepted;
  accepted = new Set();
  if (!cache?.entries) return accepted;
  for (const slug in cache.entries) {
  const entry = cache.entries[slug];
  if (!entry.solved) continue;
  if (dateRange) {
      if (entry.latestAcceptedTimestamp === null) continue;
      if ((entry.latestAcceptedTimestamp < dateRange.startSec) || (entry.latestAcceptedTimestamp > dateRange.endSec)) continue;
    }
  accepted.add(slug);
  }
  return accepted;
});
isSolved = function(slug, status, accepted, allowStatusFallback, cacheEntries) {
  return (accepted.has(slug) || (allowStatusFallback && (status === 'ac') && !(slug in cacheEntries)));
};
export const randomElementInArray = (function(arr) {
  if (!arr || (arr.length === 0)) return null;
  return arr[Math.floor(Math.random() * arr.length)];
});
solvedPoints = function(q) {
  if (q.difficulty === 'Easy') {
    return 0.4;
  }
  if (q.difficulty === 'Hard') {
    return 2;
  }
  if (q.acRate >= UPPER_AC_RATE) {
    return 0.75;
  }
  if (q.acRate > LOWER_AC_RATE) {
    return 1;
  }
  return 1.5;
};
export const getReadinessData = (function(allProblems, submissionCache, dateRange) {
  let accepted, allowFallback, data, entries, normalized, pct, pts, status, topicPoints;
  accepted = buildAcceptedSet(submissionCache, dateRange);
  allowFallback = !dateRange;
  entries = submissionCache?.entries ?? {};
  topicPoints = {};
  for (const q of allProblems.data.problemsetQuestionList.questions) {
    if (!isSolved(q.titleSlug, q.status, accepted, allowFallback, entries)) continue;
    pts = solvedPoints(q);
    for (const tag of q.topicTags) {
      topicPoints[tag.slug] = (topicPoints[tag.slug] ?? 0) + pts;
    }
  }
  data = {};
  for (const topic of TARGET_TOPICS) {
    normalized = (topicPoints[topic] ?? 0) / TARGET_TOPIC_COUNTS[topic];
    pct = normalized * 100;
    status = (normalized >= 1.0) ? 'ready' : ((normalized > 0.7) ? 'almost' : 'notReady');
    data[topic] = [status, pct];
  }
  return data;
});
export { recommendedList, recommendedSet };
classifyProblems = function(questions, topic, accepted, isPremium) {
  let key, solved, unsolved;
  unsolved = {easy: [], medEasy: [], medTarget: [], medHard: [], hard: [], all: []};
  solved = {easy: [], medium: [], hard: [], all: []};
  for (const q of questions) {
    if (!q.topicTags.some(function(t) {
      return (t.slug === topic);
    })) continue;
    if (q.paidOnly && !isPremium) continue;
    if (accepted.has(q.titleSlug)) {
      solved.all.push(q.titleSlug);
      key = q.difficulty.toLowerCase();
      solved[key].push(q.titleSlug);
    } else {
      unsolved.all.push(q.titleSlug);
      if (q.difficulty === 'Easy') {
        unsolved.easy.push(q.titleSlug);
      } else if (q.difficulty === 'Hard') {
        unsolved.hard.push(q.titleSlug);
      } else if (q.acRate >= UPPER_AC_RATE) {
        unsolved.medEasy.push(q.titleSlug);
      } else if (q.acRate > LOWER_AC_RATE) {
        unsolved.medTarget.push(q.titleSlug);
      } else {
        unsolved.medHard.push(q.titleSlug);
      }
    }
  }
  return {unsolved, solved};
};
export const getNextPracticeProblem = (function(topic, target, problems, cache, isPremium, dateRange) {
  let accepted, beforeTarget, easyFirst, recSolved, recUnsolved, solved, unsolved;
  accepted = buildAcceptedSet(cache, dateRange);
  ({unsolved, solved} = classifyProblems(problems, topic, accepted, isPremium));
  switch (target) {
    case 'easy':
      return (randomElementInArray(unsolved.easy) ?? randomElementInArray(solved.easy));
    case 'medium':
      return (randomElementInArray(unsolved.medTarget) ?? (randomElementInArray(unsolved.medEasy) ?? (randomElementInArray(unsolved.medHard) ?? randomElementInArray(solved.medium))));
    case 'hard':
      return (randomElementInArray(unsolved.hard) ?? randomElementInArray(solved.hard));
    case 'random':
      return (randomElementInArray(unsolved.all) ?? randomElementInArray(solved.all));
  }
  recUnsolved = {easy: unsolved.easy.filter(function(s) {
    return recommendedSet.has(s);
  }), medEasy: unsolved.medEasy.filter(function(s) {
    return recommendedSet.has(s);
  }), medTarget: unsolved.medTarget.filter(function(s) {
    return recommendedSet.has(s);
  }), medHard: unsolved.medHard.filter(function(s) {
    return recommendedSet.has(s);
  }), hard: unsolved.hard.filter(function(s) {
    return recommendedSet.has(s);
  })};
  recSolved = solved.all.filter(function(s) {
    return recommendedSet.has(s);
  });
  easyFirst = Math.min(10, recUnsolved.easy.length);
  beforeTarget = Math.min(15, recUnsolved.easy.length + recUnsolved.medEasy.length);
  if (easyFirst > solved.all.length) {
    return randomElementInArray(recUnsolved.easy);
  }
  if (beforeTarget > solved.all.length) {
    return randomElementInArray(recUnsolved.medEasy);
  }
  return (randomElementInArray(recUnsolved.medTarget) ?? (randomElementInArray(recUnsolved.medEasy) ?? (randomElementInArray(recUnsolved.medHard) ?? (randomElementInArray(recUnsolved.hard) ?? (randomElementInArray(recUnsolved.easy) ?? randomElementInArray(recSolved))))));
});
export const getPracticeProblem = (function(practiceType, problems, cache, isPremium, dateRange) {
  let accepted, allowFallback, bySlug, entries, q, questions, readiness, solvedList, topic;
  accepted = buildAcceptedSet(cache, dateRange);
  allowFallback = !dateRange;
  entries = cache?.entries ?? {};
  questions = problems.data.problemsetQuestionList.questions;
  switch (practiceType) {
    case 'suggested':
      bySlug = new Map(questions.map(function(q) {
        return [q.titleSlug, q];
      }));
      for (const slug of recommendedList) {
        q = bySlug.get(slug);
        if (q && (!isSolved(slug, q.status, accepted, allowFallback, entries))) {
          return slug;
        }
      };
      readiness = getReadinessData(problems, cache, dateRange);
      for (const topic of TARGET_TOPICS) {
        if (readiness[topic][0] !== 'ready') {
          return getNextPracticeProblem(topic, 'suggested', questions, cache, isPremium, dateRange);
        }
      };
      break;
    case 'review':
      solvedList = questions.filter(function(q) {
        return (isSolved(q.titleSlug, q.status, accepted, allowFallback, entries) && q.topicTags?.some(function(t) {
          return TARGET_TOPICS.includes(t.slug);
        }));
      }).map(function(q) {
        return q.titleSlug;
      });
      return randomElementInArray(solvedList);
    case 'random':
      topic = randomElementInArray([...TARGET_TOPICS]) ?? TARGET_TOPICS[0];
      return getNextPracticeProblem(topic, 'random', questions, cache, isPremium, dateRange);
  }
  return null;
});
export const computeTopicAvailability = (function(questions, accepted, isPremium, dateRange, cacheEntries) {
  let a, allowFallback, avail, diff, entries, isRecommended, solved;
  avail = {};
  for (const topic of TARGET_TOPICS) {
    avail[topic] = {suggested: {total: 0, unsolved: 0}, easy: {total: 0, unsolved: 0}, medium: {total: 0, unsolved: 0}, hard: {total: 0, unsolved: 0}, random: {total: 0, unsolved: 0}};
  }
  if (!questions) return avail;
  allowFallback = !dateRange;
  entries = cacheEntries ?? {};
  for (const q of questions) {
    if (q.paidOnly && !isPremium) continue;
    solved = isSolved(q.titleSlug, q.status, accepted, allowFallback, entries);
    isRecommended = recommendedSet.has(q.titleSlug);
    for (const tag of (q.topicTags || [])) {
      a = avail[tag.slug];
      if (!a) continue;
      diff = q.difficulty?.toLowerCase();
      if ((diff === 'easy') || (diff === 'medium') || (diff === 'hard')) {
        (a[diff].total++);
        if (!solved) (a[diff].unsolved++);
      }
      if (isRecommended) {
        (a.suggested.total++);
        if (!solved) (a.suggested.unsolved++);
      }
      (a.random.total++);
      if (!solved) (a.random.unsolved++);
    }
  }
  return avail;
});
export const computeBigButtonStates = (function(questions, accepted, isPremium, dateRange, cacheEntries) {
  let allowFallback, bySlug, entries, hasUnsolved, q, solved, states, suggestedDone, suggestedTotal;
  states = {suggested: {hasUnsolved: false, label: 'Next Suggested Problem', done: 0, total: 0}, review: {enabled: false, label: 'Review Random Completed'}, random: {hasUnsolved: true, label: 'Solve Random Problem'}};
  if (!questions) return states;
  allowFallback = !dateRange;
  entries = cacheEntries ?? {};
  bySlug = new Map(questions.map(function(q) {
    return [q.titleSlug, q];
  }));
  suggestedTotal = 0;
  suggestedDone = 0;
  hasUnsolved = false;
  for (const slug of recommendedList) {
    q = bySlug.get(slug);
    if (!q || (q.paidOnly && !isPremium)) continue;
    (suggestedTotal++);
    solved = isSolved(slug, q.status, accepted, allowFallback, entries);
    if (solved) {
      (suggestedDone++);
    } else {
      hasUnsolved = true;
    }
  }
  states.suggested.done = suggestedDone;
  states.suggested.total = suggestedTotal;
  states.suggested.hasUnsolved = hasUnsolved;
  states.suggested.label = hasUnsolved ? "Next Suggested Problem" : 'Solve Random Problem';
  states.review.enabled = questions.some(function(q) {
    return (!(q.paidOnly && !isPremium) && q.topicTags?.some(function(t) {
      return TARGET_TOPICS.includes(t.slug);
    }) && isSolved(q.titleSlug, q.status, accepted, allowFallback, entries));
  });
  return states;
});