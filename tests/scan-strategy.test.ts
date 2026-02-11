import { describe, test, expect } from 'vitest';
import { TargetedStrategy, EagerStrategy } from '../src/sync/scan-strategy';
import { q, makeCacheEntry } from './helpers';

// ─── TargetedStrategy ──────────────────────────────────────────────

describe('TargetedStrategy', () => {
  test('routes status=ac to toQuery', () => {
    const problems = [
      q({ titleSlug: 'solved-one', status: 'ac' }),
      q({ titleSlug: 'solved-two', status: 'ac' }),
    ];
    const { toQuery, toMarkUnsolved } = TargetedStrategy.partition(problems, {});
    expect(toQuery.map(p => p.titleSlug)).toEqual(['solved-one', 'solved-two']);
    expect(toMarkUnsolved).toHaveLength(0);
  });

  test('routes status=notac to toMarkUnsolved', () => {
    const problems = [
      q({ titleSlug: 'wrong-answer', status: 'notac' }),
    ];
    const { toQuery, toMarkUnsolved } = TargetedStrategy.partition(problems, {});
    expect(toQuery).toHaveLength(0);
    expect(toMarkUnsolved.map(p => p.titleSlug)).toEqual(['wrong-answer']);
  });

  test('routes never-attempted (status=null) to toMarkUnsolved', () => {
    const problems = [
      q({ titleSlug: 'never-tried', status: null }),
    ];
    const { toQuery, toMarkUnsolved } = TargetedStrategy.partition(problems, {});
    expect(toQuery).toHaveLength(0);
    expect(toMarkUnsolved.map(p => p.titleSlug)).toEqual(['never-tried']);
  });

  test('skips already-cached problems', () => {
    const problems = [
      q({ titleSlug: 'already-cached', status: 'ac' }),
      q({ titleSlug: 'not-cached', status: 'ac' }),
    ];
    const existingCache = {
      'already-cached': makeCacheEntry({ solved: true, latestAcceptedTimestamp: 100 }),
    };
    const { toQuery } = TargetedStrategy.partition(problems, existingCache);
    expect(toQuery.map(p => p.titleSlug)).toEqual(['not-cached']);
  });

  test('mixed statuses: partitions correctly', () => {
    const problems = [
      q({ titleSlug: 'a', status: 'ac' }),
      q({ titleSlug: 'b', status: 'notac' }),
      q({ titleSlug: 'c', status: null }),
      q({ titleSlug: 'd', status: 'ac' }),
    ];
    const { toQuery, toMarkUnsolved } = TargetedStrategy.partition(problems, {});
    expect(toQuery.map(p => p.titleSlug)).toEqual(['a', 'd']);
    expect(toMarkUnsolved.map(p => p.titleSlug)).toEqual(['b', 'c']);
  });
});

// ─── EagerStrategy ─────────────────────────────────────────────────

describe('EagerStrategy', () => {
  test('routes all attempted problems to toQuery', () => {
    const problems = [
      q({ titleSlug: 'solved', status: 'ac' }),
      q({ titleSlug: 'failed', status: 'notac' }),
      q({ titleSlug: 'untouched', status: null }),
    ];
    const { toQuery, toMarkUnsolved } = EagerStrategy.partition(problems, {});
    expect(toQuery.map(p => p.titleSlug)).toEqual(['solved', 'failed']);
    expect(toMarkUnsolved).toHaveLength(0);
  });

  test('skips already-cached problems', () => {
    const problems = [
      q({ titleSlug: 'cached', status: 'ac' }),
      q({ titleSlug: 'not-cached', status: 'notac' }),
    ];
    const existingCache = {
      cached: makeCacheEntry({ solved: true }),
    };
    const { toQuery } = EagerStrategy.partition(problems, existingCache);
    expect(toQuery.map(p => p.titleSlug)).toEqual(['not-cached']);
  });
});
