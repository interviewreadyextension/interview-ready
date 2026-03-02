import { describe, test, expect } from 'vitest';
import { TargetedStrategy } from '../src/sync/scan-strategy';
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

  // ─── refreshRequestedAt (forced refresh) ────────────────────────

  test('forced refresh: re-queries cached entries checked before refresh', () => {
    const problems = [
      q({ titleSlug: 'stale-entry', status: 'ac' }),
      q({ titleSlug: 'fresh-entry', status: 'ac' }),
    ];
    const existingCache = {
      'stale-entry': makeCacheEntry({ solved: true, checkedAt: 1000 }),
      'fresh-entry': makeCacheEntry({ solved: true, checkedAt: 3000 }),
    };
    // Refresh requested at t=2000: stale-entry (checked at 1000) is stale, fresh-entry (3000) is fresh
    const { toQuery } = TargetedStrategy.partition(problems, existingCache, 2000);
    expect(toQuery.map(p => p.titleSlug)).toEqual(['stale-entry']);
  });

  test('forced refresh: skips entries checked after refresh was requested', () => {
    const problems = [
      q({ titleSlug: 'already-refreshed', status: 'ac' }),
    ];
    const existingCache = {
      'already-refreshed': makeCacheEntry({ solved: true, checkedAt: 5000 }),
    };
    const { toQuery } = TargetedStrategy.partition(problems, existingCache, 2000);
    expect(toQuery).toHaveLength(0);
  });

  test('no refresh: skips all cached entries regardless of checkedAt', () => {
    const problems = [
      q({ titleSlug: 'old-entry', status: 'ac' }),
    ];
    const existingCache = {
      'old-entry': makeCacheEntry({ solved: true, checkedAt: 1 }),
    };
    // No refreshRequestedAt — old entries are kept
    const { toQuery } = TargetedStrategy.partition(problems, existingCache);
    expect(toQuery).toHaveLength(0);
  });
});
