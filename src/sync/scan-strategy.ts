/**
 * Scan Strategies — decide which problems need per-problem API calls.
 *
 * Each strategy implements `partition()`, which splits the full problem
 * list into:
 *   - `toQuery`       — problems we must call `questionSubmissionList` for
 *   - `toMarkUnsolved` — problems we can confidently mark as unsolved
 *                        without an API call (saving time)
 *
 * The cache orchestrator calls `partition()` once, then iterates
 * `toQuery` sequentially with throttling.
 */

import type { Problem } from '../types/models';
import type { SubmissionCacheEntry } from '../types/storage.types';

// ─── Interface ──────────────────────────────────────────────────────

export interface PartitionResult {
  /** Problems that require an API call to determine solve status */
  toQuery: Problem[];
  /** Problems we can mark unsolved without an API call */
  toMarkUnsolved: Problem[];
}

export interface ScanStrategy {
  readonly name: string;
  partition(
    problems: Problem[],
    existingCache: Record<string, SubmissionCacheEntry>,
  ): PartitionResult;
}

// ─── Targeted Strategy ──────────────────────────────────────────────

/**
 * Only queries problems whose `status === 'ac'` (LeetCode says accepted).
 * Problems with `status === 'notac'` or `status === null` (never attempted)
 * are marked unsolved without an API call — they have no accepted submission.
 *
 * Fastest strategy — ideal for routine syncs.
 */
export const TargetedStrategy: ScanStrategy = {
  name: 'targeted',
  partition(problems, existingCache) {
    const toQuery: Problem[] = [];
    const toMarkUnsolved: Problem[] = [];

    for (const p of problems) {
      if (existingCache[p.titleSlug]) continue; // already cached

      if (p.status === 'ac') {
        toQuery.push(p);
      } else {
        // notac or null (never attempted) — no accepted submission exists
        toMarkUnsolved.push(p);
      }
    }

    return { toQuery, toMarkUnsolved };
  },
};

// ─── Eager Strategy ─────────────────────────────────────────────────

/**
 * Queries ALL attempted problems (status !== null) that aren't cached.
 * Catches edge cases where `status` may be stale, at the cost of
 * more API calls.
 */
export const EagerStrategy: ScanStrategy = {
  name: 'eager',
  partition(problems, existingCache) {
    const toQuery: Problem[] = [];

    for (const p of problems) {
      if (existingCache[p.titleSlug]) continue;
      if (p.status !== null) {
        toQuery.push(p);
      }
    }

    return { toQuery, toMarkUnsolved: [] };
  },
};
