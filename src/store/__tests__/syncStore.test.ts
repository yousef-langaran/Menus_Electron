import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncStore } from '../syncStore';

const initialState = useSyncStore.getState();

beforeEach(() => {
  useSyncStore.setState(initialState, true);
});

describe('useSyncStore', () => {
  it('starts optimistic: online, idle and with an empty queue', () => {
    const state = useSyncStore.getState();

    expect(state.isOnline).toBe(true);
    expect(state.isSyncing).toBe(false);
    expect(state.pendingOps).toBe(0);
    expect(state.failedOps).toBe(0);
    expect(state.lastSyncedAt).toBeNull();
    expect(state.lastError).toBeNull();
  });

  it('setOnline flips connectivity without disturbing the queue counters', () => {
    useSyncStore.getState().setQueueState(3, 1);
    useSyncStore.getState().setOnline(false);

    const state = useSyncStore.getState();
    expect(state.isOnline).toBe(false);
    expect(state.pendingOps).toBe(3);
    expect(state.failedOps).toBe(1);
  });

  it('setSyncing toggles the in-flight flag', () => {
    useSyncStore.getState().setSyncing(true);
    expect(useSyncStore.getState().isSyncing).toBe(true);

    useSyncStore.getState().setSyncing(false);
    expect(useSyncStore.getState().isSyncing).toBe(false);
  });

  it('setQueueState replaces both counters together', () => {
    useSyncStore.getState().setQueueState(5, 2);

    expect(useSyncStore.getState().pendingOps).toBe(5);
    expect(useSyncStore.getState().failedOps).toBe(2);
  });

  it('setQueueState can clear the queue back to zero', () => {
    useSyncStore.getState().setQueueState(5, 2);
    useSyncStore.getState().setQueueState(0, 0);

    expect(useSyncStore.getState().pendingOps).toBe(0);
    expect(useSyncStore.getState().failedOps).toBe(0);
  });

  it('setLastSyncedAt records and can clear the timestamp', () => {
    useSyncStore.getState().setLastSyncedAt('2026-08-01T10:00:00.000Z');
    expect(useSyncStore.getState().lastSyncedAt).toBe('2026-08-01T10:00:00.000Z');

    useSyncStore.getState().setLastSyncedAt(null);
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();
  });

  it('setLastError records and can clear the last failure', () => {
    useSyncStore.getState().setLastError('connection refused');
    expect(useSyncStore.getState().lastError).toBe('connection refused');

    useSyncStore.getState().setLastError(null);
    expect(useSyncStore.getState().lastError).toBeNull();
  });

  it('keeps a recorded error visible after coming back online, so the banner is not lost', () => {
    useSyncStore.getState().setOnline(false);
    useSyncStore.getState().setLastError('connection refused');
    useSyncStore.getState().setOnline(true);

    expect(useSyncStore.getState().lastError).toBe('connection refused');
  });
});
