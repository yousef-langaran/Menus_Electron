import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// serviceJobsSync's *own* coordination logic (per-job op ordering, temp-ID
// reassignment mid-push, the single-flight lock) is what's under test here,
// so both its local Dexie store and the API layer are mocked — unlike
// catalogSync/accountingSync where the local Dexie store is exercised for
// real, this module's local-DB calls are simple pass-throughs with no
// interesting invariants of their own beyond "called with the right args".
// Fully mocked (no vi.importActual) — the real module constructs a Dexie
// database at import time, which would require an IndexedDB backend we do
// not need here since none of this module's local-DB calls have interesting
// invariants of their own beyond "called with the right args".
vi.mock('../serviceJobsLocalDb', () => ({
  bulkUpsertServerJobs: vi.fn(),
  bulkUpsertServerJobItems: vi.fn(),
  deleteStaleBoards: vi.fn(),
  deleteStaleServerJobs: vi.fn(),
  deleteOp: vi.fn(),
  getLocalServiceJobItems: vi.fn().mockResolvedValue([]),
  getPendingOpsGroupedByJob: vi.fn(),
  getSjSyncMeta: vi.fn().mockResolvedValue(new Date().toISOString()), // skip full job pull by default
  markOpFailed: vi.fn(),
  reassignJobLocalId: vi.fn(),
  setSjSyncMeta: vi.fn(),
  upsertLocalServiceBoards: vi.fn(),
  serviceJobsDb: { serviceJobs: { update: vi.fn() } },
}));

vi.mock('../api', () => ({
  getServiceBoards: vi.fn().mockResolvedValue([]),
  createServiceJobRemote: vi.fn(),
  listServiceJobsRemote: vi.fn(),
  updateServiceJobRemote: vi.fn(),
  moveServiceJobStatusRemote: vi.fn(),
  addServiceJobItemRemote: vi.fn(),
  updateServiceJobItemRemote: vi.fn(),
  removeServiceJobItemRemote: vi.fn(),
  getServiceJobRemote: vi.fn(),
}));

import * as api from '../api';
import * as localDb from '../serviceJobsLocalDb';
import { runServiceJobsSync } from '../serviceJobsSync';
import type { LocalServiceJobOp } from '../serviceJobsLocalDb';

const RID = 42;
const TOKEN = 'test-token';

function op(partial: Partial<LocalServiceJobOp> & Pick<LocalServiceJobOp, 'id' | 'opType' | 'payload'>): LocalServiceJobOp {
  return {
    jobLocalId: -1,
    restaurantId: RID,
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...partial,
  } as LocalServiceJobOp;
}

beforeEach(() => {
  vi.clearAllMocks();
  (localDb.getSjSyncMeta as any).mockResolvedValue(new Date().toISOString());
  (localDb.getLocalServiceJobItems as any).mockResolvedValue([]);
  (api.getServiceBoards as any).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runServiceJobsSync per-job op ordering', () => {
  it('stops processing a job\'s queue at the first failing op, preserving order (later ops stay queued)', async () => {
    const ops = [
      op({ id: 1, opType: 'update', payload: { title: 'A' } }),
      op({ id: 2, opType: 'move', payload: { statusId: 9 } }),
    ];
    (localDb.getPendingOpsGroupedByJob as any).mockResolvedValueOnce(new Map([[100, ops]]));
    (api.updateServiceJobRemote as any).mockRejectedValueOnce(new Error('server 500'));

    const result = await runServiceJobsSync({ restaurantId: RID, token: TOKEN });

    expect(result.jobsPushed).toBe(0);
    expect(result.jobsFailed).toBe(1);
    expect(api.updateServiceJobRemote).toHaveBeenCalledTimes(1);
    // The move op must never run — order is preserved, not reordered/parallelized.
    expect(api.moveServiceJobStatusRemote).not.toHaveBeenCalled();
    expect(localDb.markOpFailed).toHaveBeenCalledWith(1, expect.any(String));
    expect(localDb.deleteOp).not.toHaveBeenCalled();
  });

  it('reassigns the local temp job ID to the server ID from a create op and uses it for subsequent ops in the same push', async () => {
    const ops = [
      op({ id: 1, opType: 'create', payload: { title: 'New job' } }),
      op({ id: 2, opType: 'update', payload: { title: 'New job (edited)' } }),
    ];
    (localDb.getPendingOpsGroupedByJob as any).mockResolvedValueOnce(new Map([[-10, ops]]));
    (api.createServiceJobRemote as any).mockResolvedValueOnce({ id: 555, items: [] });
    (api.updateServiceJobRemote as any).mockResolvedValueOnce({ id: 555, items: [] });

    const result = await runServiceJobsSync({ restaurantId: RID, token: TOKEN });

    expect(result.jobsPushed).toBe(2);
    expect(localDb.reassignJobLocalId).toHaveBeenCalledWith(-10, 555);
    expect(api.updateServiceJobRemote).toHaveBeenCalledWith(555, RID, { title: 'New job (edited)' }, TOKEN);
    expect(localDb.deleteOp).toHaveBeenCalledTimes(2);
  });

  it('does not resend an op that already succeeded and was removed from the local queue', async () => {
    const ops = [op({ id: 1, opType: 'update', payload: { title: 'A' } })];
    (localDb.getPendingOpsGroupedByJob as any)
      .mockResolvedValueOnce(new Map([[100, ops]]))
      // Second sync run: the local queue mock reflects that op 1 was already
      // deleted after its successful push, so nothing is pending anymore.
      .mockResolvedValueOnce(new Map());
    (api.updateServiceJobRemote as any).mockResolvedValueOnce({ id: 100, items: [] });

    const first = await runServiceJobsSync({ restaurantId: RID, token: TOKEN });
    expect(first.jobsPushed).toBe(1);
    expect(api.updateServiceJobRemote).toHaveBeenCalledTimes(1);
    expect(localDb.deleteOp).toHaveBeenCalledWith(1);

    const second = await runServiceJobsSync({ restaurantId: RID, token: TOKEN });
    expect(second.jobsPushed).toBe(0);
    // The regression this protects: a redundant sync trigger must not
    // resend an op that already succeeded.
    expect(api.updateServiceJobRemote).toHaveBeenCalledTimes(1);
  });
});

describe('runServiceJobsSync single-flight lock', () => {
  it('shares one in-flight run across concurrent callers instead of starting a second overlapping sync', async () => {
    let resolveGrouped!: (v: Map<number, LocalServiceJobOp[]>) => void;
    (localDb.getPendingOpsGroupedByJob as any).mockImplementation(
      () => new Promise((res) => { resolveGrouped = res; }),
    );

    const callA = runServiceJobsSync({ restaurantId: RID, token: TOKEN });
    const callB = runServiceJobsSync({ restaurantId: RID, token: TOKEN });

    // Let both calls run up to (and get stuck on) the in-flight queue read,
    // then release it — asserting call counts only after resolving, so a
    // failed premature assertion can never leave a dangling unresolved
    // promise behind for later tests to hang on.
    await new Promise((r) => setTimeout(r, 0));
    resolveGrouped(new Map());
    const [resultA, resultB] = await Promise.all([callA, callB]);

    expect(resultA).toEqual(resultB);
    // Only one real pass should have read the queue — the second caller
    // shared the first caller's in-flight run instead of starting its own.
    expect(localDb.getPendingOpsGroupedByJob).toHaveBeenCalledTimes(1);

    // Once settled, a later call is a genuinely new pass.
    (localDb.getPendingOpsGroupedByJob as any).mockResolvedValueOnce(new Map());
    await runServiceJobsSync({ restaurantId: RID, token: TOKEN });
    expect(localDb.getPendingOpsGroupedByJob).toHaveBeenCalledTimes(2);
  });
});

describe('runServiceJobsSync offline short-circuit', () => {
  it('does nothing and pushes/pulls nothing when offline', async () => {
    const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      const result = await runServiceJobsSync({ restaurantId: RID, token: TOKEN });
      expect(result).toEqual({ isOnline: false, jobsPushed: 0, jobsFailed: 0, boardsPulled: 0, jobsPulled: 0 });
      expect(localDb.getPendingOpsGroupedByJob).not.toHaveBeenCalled();
    } finally {
      if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    }
  });
});
