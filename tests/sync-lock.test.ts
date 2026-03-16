import { describe, test, expect, vi, beforeEach } from 'vitest';
import { installChromeStub } from './helpers';
import {
  acquireSyncLock,
  heartbeatSyncLock,
  releaseSyncLock,
  LOCK_KEY,
  STALE_THRESHOLD_MS,
} from '../src/sync/sync-lock';

beforeEach(() => {
  installChromeStub();
});

describe('acquireSyncLock', () => {
  test('acquires lock when no lock exists', async () => {
    const result = await acquireSyncLock('tab-A');
    expect(result).toBe(true);

    // Lock should be in storage
    const stored = await chrome.storage.local.get(LOCK_KEY);
    expect(stored[LOCK_KEY]).toMatchObject({ ownerId: 'tab-A' });
  });

  test('rejects when another tab holds a fresh lock', async () => {
    // Tab A acquires
    await acquireSyncLock('tab-A');

    // Tab B tries — should be rejected
    const result = await acquireSyncLock('tab-B');
    expect(result).toBe(false);

    // Tab A still owns the lock
    const stored = await chrome.storage.local.get(LOCK_KEY);
    expect(stored[LOCK_KEY]).toMatchObject({ ownerId: 'tab-A' });
  });

  test('takes over a stale lock', async () => {
    // Simulate a stale lock (heartbeat way in the past)
    await chrome.storage.local.set({
      [LOCK_KEY]: {
        ownerId: 'dead-tab',
        heartbeatAt: Date.now() - STALE_THRESHOLD_MS - 1000,
        startedAt: Date.now() - 120_000,
      },
    });

    const result = await acquireSyncLock('tab-B');
    expect(result).toBe(true);

    const stored = await chrome.storage.local.get(LOCK_KEY);
    expect(stored[LOCK_KEY]).toMatchObject({ ownerId: 'tab-B' });
  });
});

describe('heartbeatSyncLock', () => {
  test('updates heartbeat for the lock owner', async () => {
    await acquireSyncLock('tab-A');

    const before = (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY] as any;
    const beforeBeat = before.heartbeatAt;

    // Small delay to get a different timestamp
    await new Promise(r => setTimeout(r, 10));

    const result = await heartbeatSyncLock('tab-A');
    expect(result).toBe(true);

    const after = (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY] as any;
    expect(after.heartbeatAt).toBeGreaterThanOrEqual(beforeBeat);
  });

  test('returns false if another tab owns the lock', async () => {
    await acquireSyncLock('tab-A');

    const result = await heartbeatSyncLock('tab-B');
    expect(result).toBe(false);
  });

  test('returns false if no lock exists', async () => {
    const result = await heartbeatSyncLock('tab-A');
    expect(result).toBe(false);
  });
});

describe('releaseSyncLock', () => {
  test('removes lock when owner matches', async () => {
    await acquireSyncLock('tab-A');
    await releaseSyncLock('tab-A');

    const stored = await chrome.storage.local.get(LOCK_KEY);
    expect(stored[LOCK_KEY]).toBeUndefined();
  });

  test('does not remove lock owned by another tab', async () => {
    await acquireSyncLock('tab-A');

    // Tab B tries to release — should not work
    await releaseSyncLock('tab-B');

    const stored = await chrome.storage.local.get(LOCK_KEY);
    expect(stored[LOCK_KEY]).toMatchObject({ ownerId: 'tab-A' });
  });

  test('no-op when no lock exists', async () => {
    // Should not throw
    await releaseSyncLock('tab-A');
  });
});

describe('STALE_THRESHOLD_MS', () => {
  test('is derived from API retry constants', () => {
    // REQUEST_TIMEOUT_MS=15000, MAX_RETRIES=3, SAFETY_MARGIN=15000
    // 15000 * 3 + 15000 = 60000
    expect(STALE_THRESHOLD_MS).toBe(60_000);
  });
});
