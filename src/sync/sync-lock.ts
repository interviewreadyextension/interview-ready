/**
 * Sync Lock — storage-based lease lock for cross-tab coordination.
 *
 * Ensures only one LeetCode tab runs the submission cache scan at a time.
 * Uses a heartbeat pattern: the lock holder updates `heartbeatAt` before
 * each API call. If the heartbeat goes stale (tab closed/crashed), another
 * tab can take over.
 *
 * Staleness threshold is derived from the API retry constants so the
 * relationship is explicit and self-adjusting.
 */

import { REQUEST_TIMEOUT_MS, MAX_RETRIES } from '../api/leetcode-graphql';

// ─── Constants ──────────────────────────────────────────────────────

export const LOCK_KEY = '_syncLock';

/** Worst case for one API call: all retries hit the request timeout. */
const WORST_CASE_PER_PROBLEM_MS = REQUEST_TIMEOUT_MS * MAX_RETRIES;

/** Safety margin on top of worst case. */
const SAFETY_MARGIN_MS = 15_000;

/**
 * A lock is considered stale (owner presumed dead) if the heartbeat
 * is older than this. Derived from the API retry constants so that a
 * tab retrying a slow/failing request won't be falsely evicted.
 */
export const STALE_THRESHOLD_MS = WORST_CASE_PER_PROBLEM_MS + SAFETY_MARGIN_MS;

/** Delay for the double-check acquire pattern (ms). */
const DOUBLE_CHECK_DELAY_MS = 200;

// ─── Types ──────────────────────────────────────────────────────────

export interface SyncLock {
  ownerId: string;
  heartbeatAt: number;
  startedAt: number;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Attempt to acquire the sync lock.
 *
 * Returns `true` if this owner now holds the lock.
 * Returns `false` if another tab is actively scanning.
 *
 * Uses a double-check pattern to mitigate the race window where two
 * tabs read "no lock" simultaneously: write, wait 200ms, re-read.
 */
export async function acquireSyncLock(ownerId: string): Promise<boolean> {
  const existing = await readLock();

  if (existing && (Date.now() - existing.heartbeatAt) < STALE_THRESHOLD_MS) {
    // Another tab is actively scanning
    return false;
  }

  // Write our lock
  const lock: SyncLock = {
    ownerId,
    heartbeatAt: Date.now(),
    startedAt: Date.now(),
  };
  await writeLock(lock);

  // Double-check: did we win the race?
  await new Promise(r => setTimeout(r, DOUBLE_CHECK_DELAY_MS));
  const check = await readLock();
  return check?.ownerId === ownerId;
}

/**
 * Update the heartbeat timestamp. Call this before each API request
 * so the lock stays fresh even during slow retries.
 *
 * Only writes if this owner still holds the lock (another tab may
 * have taken over if we were stalled).
 */
export async function heartbeatSyncLock(ownerId: string): Promise<boolean> {
  const current = await readLock();
  if (current?.ownerId !== ownerId) {
    // We lost the lock — stop scanning
    return false;
  }

  await writeLock({ ...current, heartbeatAt: Date.now() });
  return true;
}

/**
 * Release the lock. Only removes it if we still own it.
 */
export async function releaseSyncLock(ownerId: string): Promise<void> {
  const current = await readLock();
  if (current?.ownerId === ownerId) {
    await chrome.storage.local.remove(LOCK_KEY);
  }
}

// ─── Internal helpers ───────────────────────────────────────────────

async function readLock(): Promise<SyncLock | null> {
  const result = await chrome.storage.local.get(LOCK_KEY);
  return (result[LOCK_KEY] as SyncLock) ?? null;
}

async function writeLock(lock: SyncLock): Promise<void> {
  await chrome.storage.local.set({ [LOCK_KEY]: lock });
}
