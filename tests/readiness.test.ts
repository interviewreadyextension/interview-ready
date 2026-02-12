import { describe, test, expect } from 'vitest';
import {
  getReadinessData,
  buildAcceptedSet,
  getNextPracticeProblem,
  getPracticeProblem,
  randomElementInArray,
  computeTopicAvailability,
  recommendedList,
  TARGET_TOPICS,
  TARGET_TOPIC_COUNTS,
} from '../src/readiness-logic/readiness';
import {
  makeAllProblems,
  makeCacheData,
  makeCacheEntry,
  q,
} from './helpers';

// ─── randomElementInArray ──────────────────────────────────────────

describe('randomElementInArray', () => {
  test('returns an element from the array', () => {
    const arr = ['a', 'b', 'c'];
    const v = randomElementInArray(arr);
    expect(arr).toContain(v);
  });

  test('returns null for empty arrays', () => {
    expect(randomElementInArray([])).toBe(null);
  });
});

// ─── buildAcceptedSet ──────────────────────────────────────────────

describe('buildAcceptedSet', () => {
  test('returns empty set when no submissions', () => {
    const set = buildAcceptedSet(undefined);
    expect(set.size).toBe(0);
  });

  test('includes slugs from cache entries', () => {
    const cache = makeCacheData({
      a: makeCacheEntry({ solved: true }),
      b: makeCacheEntry({ solved: true }),
    });
    const set = buildAcceptedSet(cache);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
  });

  test('excludes unsolved entries', () => {
    const cache = makeCacheData({
      solved: makeCacheEntry({ solved: true }),
      unsolved: makeCacheEntry({ solved: false }),
    });
    const set = buildAcceptedSet(cache);
    expect(set.has('solved')).toBe(true);
    expect(set.has('unsolved')).toBe(false);
  });

  test('filters entries by date range', () => {
    const cache = makeCacheData({
      recent: makeCacheEntry({ solved: true, latestAcceptedTimestamp: 1000 }),
      old: makeCacheEntry({ solved: true, latestAcceptedTimestamp: 100 }),
    });
    // Range that includes timestamp 1000 but not 100
    const set = buildAcceptedSet(cache, { startSec: 500, endSec: 2000 });
    expect(set.has('recent')).toBe(true);
    expect(set.has('old')).toBe(false);
  });

  test('excludes solved entries with null timestamp when date range is active', () => {
    const cache = makeCacheData({
      'has-ts': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 1000 }),
      'no-ts': makeCacheEntry({ solved: true, latestAcceptedTimestamp: null }),
    });
    // With a date range, null-timestamp entries should be excluded
    const filtered = buildAcceptedSet(cache, { startSec: 500, endSec: 2000 });
    expect(filtered.has('has-ts')).toBe(true);
    expect(filtered.has('no-ts')).toBe(false);

    // Without a date range, null-timestamp entries should be included
    const allTime = buildAcceptedSet(cache);
    expect(allTime.has('has-ts')).toBe(true);
    expect(allTime.has('no-ts')).toBe(true);
  });
});

// ─── getReadinessData ──────────────────────────────────────────────

describe('getReadinessData', () => {
  test('initializes all target topics', () => {
    const allProblems = makeAllProblems([]);
    const result = getReadinessData(allProblems);

    for (const topic of TARGET_TOPICS) {
      expect(result[topic]).toBeDefined();
      expect(result[topic][0]).toBe('notReady');
      expect(result[topic][1]).toBe(0);
    }
  });

  test('treats cache entries as solved (even if problem status is not "ac")', () => {
    const allProblems = makeAllProblems([
      q({ titleSlug: 'x', difficulty: 'Easy', status: null, topicSlugs: ['array'] }),
    ]);

    const cache = makeCacheData({
      x: makeCacheEntry({ solved: true, latestAcceptedTimestamp: 1 }),
    });

    const result = getReadinessData(allProblems, cache);
    expect(result.array).toBeDefined();
    expect(result.array[1]).not.toBe(0);
  });

  test('readiness thresholds: >=100% ready, >70% almost', () => {
    // With Easy points=0.4, we can reach 100% for a topic by repeating enough Easy solves.
    const target = TARGET_TOPIC_COUNTS['queue'];
    const needed = Math.ceil(target / 0.4);

    const questions = [];
    for (let i = 0; i < needed; i++) {
      questions.push(q({ titleSlug: `q-${i}`, difficulty: 'Easy', status: 'ac', topicSlugs: ['queue'] }));
    }

    const allProblems = makeAllProblems(questions);
    const result = getReadinessData(allProblems);

    expect(result.queue[0]).toBe('ready');
    expect(result.queue[1]).toBeGreaterThanOrEqual(100);
  });

  test('Medium scoring weights by acceptance-rate band (easier < target < harder)', () => {
    const scoreFor = (acRate: number) => {
      const allProblems = makeAllProblems([
        q({
          titleSlug: `m-${acRate}`,
          difficulty: 'Medium',
          acRate,
          status: 'ac',
          topicSlugs: ['hash-table'],
        }),
      ]);
      return getReadinessData(allProblems)['hash-table'][1];
    };

    const easier = scoreFor(70); // >=60 => easier Medium
    const target = scoreFor(50); // 40-60 => target Medium
    const harder = scoreFor(30); // <40 => harder Medium

    expect(easier).toBeGreaterThan(0);
    expect(target).toBeGreaterThan(easier);
    expect(harder).toBeGreaterThan(target);
  });
});

// ─── getNextPracticeProblem ────────────────────────────────────────

describe('getNextPracticeProblem', () => {
  test('excludes problems in submission cache', () => {
    const restoreRandom = Math.random;
    Math.random = () => 0;

    const questions = [
      q({ titleSlug: 'recently-solved', difficulty: 'Easy', status: null, topicSlugs: ['array'] }),
      q({ titleSlug: 'still-unsolved', difficulty: 'Easy', status: null, topicSlugs: ['array'] }),
    ];
    const cache = makeCacheData({ 'recently-solved': makeCacheEntry({ solved: true }) });

    try {
      const slug = getNextPracticeProblem('array', 'easy', questions, cache, false);
      expect(slug).toBe('still-unsolved');
    } finally {
      Math.random = restoreRandom;
    }
  });

  test('never returns paid-only problems for non-premium users', () => {
    const restoreRandom = Math.random;
    Math.random = () => 0;

    const questions = [
      q({ titleSlug: 'paid', difficulty: 'Easy', status: null, paidOnly: true, topicSlugs: ['array'] }),
      q({ titleSlug: 'free', difficulty: 'Easy', status: null, paidOnly: false, topicSlugs: ['array'] }),
    ];
    const cache = makeCacheData();

    try {
      const slug = getNextPracticeProblem('array', 'easy', questions, cache, false);
      expect(slug).toBe('free');
    } finally {
      Math.random = restoreRandom;
    }
  });

  test('returns null when there are no eligible problems', () => {
    const questions = [
      q({ titleSlug: 'paid', difficulty: 'Easy', status: null, paidOnly: true, topicSlugs: ['array'] }),
    ];
    const cache = makeCacheData();

    const slug = getNextPracticeProblem('array', 'easy', questions, cache, false);
    expect(slug).toBe(null);
  });

  test('must not return null when eligible problems exist', () => {
    const restoreRandom = Math.random;
    Math.random = () => 0;

    const questions = [
      q({ titleSlug: 'concatenation-of-array', difficulty: 'Easy', status: null, topicSlugs: ['array'] }),
    ];
    const cache = makeCacheData();

    try {
      const slug = getNextPracticeProblem('array', 'suggested', questions, cache, false);
      expect(slug).not.toBe(null);
      expect(typeof slug).toBe('string');
    } finally {
      Math.random = restoreRandom;
    }
  });
});

// ─── getPracticeProblem ────────────────────────────────────────────

describe('getPracticeProblem', () => {
  test('suggested: returns first recommended slug not yet accepted', () => {
    const accepted = new Set(recommendedList.slice(0, 3));
    const allQuestions = recommendedList.slice(0, 5).map((slug) =>
      q({ titleSlug: slug, status: accepted.has(slug) ? 'ac' : null, difficulty: 'Easy', topicSlugs: ['array'] })
    );
    const problemData = makeAllProblems(allQuestions);
    const cache = makeCacheData();

    const slug = getPracticeProblem('suggested', problemData, cache, false);
    expect(slug).toBe(recommendedList[3]);
  });

  test('review: returns null when nothing accepted', () => {
    const problemData = makeAllProblems([
      q({ titleSlug: 'a', status: null, difficulty: 'Easy', topicSlugs: ['array'] }),
    ]);
    const cache = makeCacheData();

    const slug = getPracticeProblem('review', problemData, cache, false);
    expect(slug).toBe(null);
  });

  test('review: reads from submissionCacheKey', () => {
    const problemData = makeAllProblems([
      q({ titleSlug: 'two-sum', status: null, difficulty: 'Easy', topicSlugs: ['array'] }),
    ]);
    const cache = makeCacheData({
      'two-sum': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 1 }),
    });

    const slug = getPracticeProblem('review', problemData, cache, false);
    expect(slug).toBe('two-sum');
  });

  test('suggested: must not return null when recommended problems exist', () => {
    const problemData = makeAllProblems([
      q({
        titleSlug: 'find-first-palindromic-string-in-the-array',
        difficulty: 'Easy',
        status: null,
        topicSlugs: ['array'],
      }),
    ]);
    const cache = makeCacheData();

    const slug = getPracticeProblem('suggested', problemData, cache, false);
    expect(slug).not.toBe(null);
    expect(typeof slug).toBe('string');
  });

  test('random: must not return null when problems exist', () => {
    const restoreRandom = Math.random;
    Math.random = () => 0;

    const problemData = makeAllProblems([
      q({ titleSlug: 'some-problem', difficulty: 'Medium', status: null, topicSlugs: ['hash-table'] }),
    ]);
    const cache = makeCacheData();

    try {
      const slug = getPracticeProblem('random', problemData, cache, false);
      expect(slug).not.toBe(null);
      expect(typeof slug).toBe('string');
    } finally {
      Math.random = restoreRandom;
    }
  });

  test('returns null when no problems available', () => {
    const problemData = makeAllProblems([]);
    const cache = makeCacheData();

    const slug = getPracticeProblem('random', problemData, cache, false);
    expect(slug).toBe(null);
  });
});

// ─── computeTopicAvailability ──────────────────────────────────────

describe('computeTopicAvailability', () => {
  test('suggested counts only include problems in recommended list', () => {
    const questions = [
      q({ titleSlug: 'concatenation-of-array', difficulty: 'Easy', status: null, topicSlugs: ['array'] }), // in recommendedList
      q({ titleSlug: 'not-recommended-1', difficulty: 'Easy', status: null, topicSlugs: ['array'] }),
      q({ titleSlug: 'not-recommended-2', difficulty: 'Medium', status: null, topicSlugs: ['array'] }),
      q({ titleSlug: 'spiral-matrix', difficulty: 'Medium', status: null, topicSlugs: ['array'] }), // in recommendedList
    ];
    
    const accepted = new Set<string>();
    const avail = computeTopicAvailability(questions, accepted, false);
    
    // 'suggested' should only count the 2 recommended problems
    expect(avail.array.suggested.total).toBe(2);
    expect(avail.array.suggested.unsolved).toBe(2);
    
    // 'easy' should count all easy problems
    expect(avail.array.easy.total).toBe(2);
    expect(avail.array.easy.unsolved).toBe(2);
    
    // 'medium' should count all medium problems
    expect(avail.array.medium.total).toBe(2);
    expect(avail.array.medium.unsolved).toBe(2);
    
    // 'random' should count all problems
    expect(avail.array.random.total).toBe(4);
    expect(avail.array.random.unsolved).toBe(4);
  });

  test('suggested counts exclude solved recommended problems', () => {
    const questions = [
      q({ titleSlug: 'concatenation-of-array', difficulty: 'Easy', status: 'ac', topicSlugs: ['array'] }), // solved & recommended
      q({ titleSlug: 'spiral-matrix', difficulty: 'Medium', status: null, topicSlugs: ['array'] }), // unsolved & recommended
    ];
    
    const accepted = new Set(['concatenation-of-array']);
    const avail = computeTopicAvailability(questions, accepted, false);
    
    expect(avail.array.suggested.total).toBe(2);
    expect(avail.array.suggested.unsolved).toBe(1); // only spiral-matrix
  });
});
