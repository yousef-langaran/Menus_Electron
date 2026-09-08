import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Follows the same mocking convention as orders.test.ts / returns.test.ts:
// this is main-process code, so `electron` and `fs` are mocked rather than
// exercised against a real filesystem.
const mkdir = vi.fn().mockResolvedValue(undefined);
const readFile = vi.fn();
const writeFile = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/userData') },
}));

vi.mock('fs', () => ({
  promises: { mkdir, readFile, writeFile },
}));

const {
  saveOfflineShiftAction,
  getOfflineShiftActions,
  getAllShiftActions,
  markShiftActionSynced,
  markShiftActionError,
  resolveServerShiftIdForKey,
  deleteShiftAction,
} = await import('../posShifts');

const enoent = () => Object.assign(new Error('not found'), { code: 'ENOENT' });

/** Reads back whatever the module most recently wrote to disk (all writes are full-file rewrites). */
function lastWritten(): any[] {
  const lastCall = writeFile.mock.calls.at(-1);
  return JSON.parse(lastCall![1] as string);
}

const openAction = (overrides: Partial<Record<string, unknown>> = {}) => ({
  type: 'open' as const,
  clientShiftKey: 'key-1',
  restaurantId: 1,
  payload: { openingCash: 1000 },
  serverShiftId: null,
  token: 'tok-1',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  readFile.mockRejectedValue(enoent()); // empty queue by default
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveOfflineShiftAction / getOfflineShiftActions / getAllShiftActions', () => {
  it('appends a new unsynced shift action to an empty queue', async () => {
    const id = await saveOfflineShiftAction(openAction());

    expect(typeof id).toBe('number');
    const written = lastWritten();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      id,
      type: 'open',
      clientShiftKey: 'key-1',
      synced: false,
    });
    expect(mkdir).toHaveBeenCalled();
  });

  it('appends to (never overwrites) an existing queue on disk', async () => {
    const existing = [
      { id: 1, ...openAction(), createdAt: '2026-01-01T00:00:00.000Z', synced: false },
    ];
    readFile.mockResolvedValue(JSON.stringify(existing));

    await saveOfflineShiftAction(openAction({ clientShiftKey: 'key-2' }));

    const written = lastWritten();
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(existing[0]);
  });

  it('getOfflineShiftActions returns only the unsynced rows', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, ...openAction(), createdAt: 'a', synced: true },
        { id: 2, ...openAction(), createdAt: 'b', synced: false },
      ]),
    );

    const pending = await getOfflineShiftActions();
    expect(pending).toEqual([{ id: 2, ...openAction(), createdAt: 'b', synced: false }]);
  });

  it('getAllShiftActions returns every row, newest first', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, ...openAction(), createdAt: '2026-01-01T00:00:00.000Z', synced: true },
        { id: 2, ...openAction(), createdAt: '2026-06-01T00:00:00.000Z', synced: false },
      ]),
    );

    const all = await getAllShiftActions();
    expect(all.map((a) => a.id)).toEqual([2, 1]);
  });

  it('treats a missing queue file as an empty queue rather than an error', async () => {
    readFile.mockRejectedValue(enoent());
    await expect(getAllShiftActions()).resolves.toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('treats a corrupted queue file as empty and logs it, rather than crashing the main process', async () => {
    readFile.mockResolvedValue('{ not json');
    await expect(getAllShiftActions()).resolves.toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('markShiftActionSynced', () => {
  it('marks only the matching action as synced, leaving others untouched', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, ...openAction(), createdAt: 'a', synced: false },
        { id: 2, ...openAction(), createdAt: 'b', synced: false },
      ]),
    );

    await markShiftActionSynced(1, 42);

    const written = lastWritten();
    expect(written.find((a: any) => a.id === 1)).toMatchObject({ synced: true, serverShiftId: 42 });
    expect(written.find((a: any) => a.id === 1).syncedAt).toEqual(expect.any(String));
    expect(written.find((a: any) => a.id === 2)).toMatchObject({ synced: false });
  });

  it('is a no-op (no write) when the ID is not found', async () => {
    readFile.mockResolvedValue(JSON.stringify([{ id: 1, ...openAction(), createdAt: 'a', synced: false }]));

    await markShiftActionSynced(999);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('markShiftActionError', () => {
  it('records the error message on only the matching action', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, ...openAction(), createdAt: 'a', synced: false },
        { id: 2, ...openAction(), createdAt: 'b', synced: false },
      ]),
    );

    await markShiftActionError(1, 'network down');

    const written = lastWritten();
    expect(written.find((a: any) => a.id === 1)).toMatchObject({ lastError: 'network down' });
    expect(written.find((a: any) => a.id === 2).lastError).toBeUndefined();
  });
});

describe('resolveServerShiftIdForKey', () => {
  it('fills serverShiftId on every pending action for the given clientShiftKey', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, ...openAction(), type: 'close', clientShiftKey: 'key-1', serverShiftId: null, createdAt: 'a', synced: false },
        { id: 2, ...openAction(), type: 'close', clientShiftKey: 'key-1', serverShiftId: null, createdAt: 'b', synced: false },
        { id: 3, ...openAction(), clientShiftKey: 'key-2', createdAt: 'c', synced: false },
      ]),
    );

    await resolveServerShiftIdForKey('key-1', 77);

    const written = lastWritten();
    expect(written.find((a: any) => a.id === 1).serverShiftId).toBe(77);
    expect(written.find((a: any) => a.id === 2).serverShiftId).toBe(77);
    expect(written.find((a: any) => a.id === 3).serverShiftId).toBeNull();
  });
});

describe('deleteShiftAction', () => {
  it('removes only the matching action', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, ...openAction(), createdAt: 'a', synced: true },
        { id: 2, ...openAction(), createdAt: 'b', synced: false },
      ]),
    );

    await deleteShiftAction(1);

    const written = lastWritten();
    expect(written.map((a: any) => a.id)).toEqual([2]);
  });

  it('is a no-op (no write) when the ID is not found', async () => {
    readFile.mockResolvedValue(JSON.stringify([{ id: 1, ...openAction(), createdAt: 'a', synced: false }]));

    await deleteShiftAction(999);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('concurrent writes are serialized through the internal lock', () => {
  it('does not lose an action when two saves race on the same read-modify-write cycle', async () => {
    let queue: any[] = [];
    readFile.mockImplementation(async () => {
      await Promise.resolve();
      return JSON.stringify(queue);
    });
    writeFile.mockImplementation(async (_path: string, data: string) => {
      queue = JSON.parse(data);
    });

    await Promise.all([
      saveOfflineShiftAction(openAction({ clientShiftKey: 'key-a' })),
      saveOfflineShiftAction(openAction({ clientShiftKey: 'key-b' })),
    ]);

    expect(queue).toHaveLength(2);
  });

  // Regression test for T-0022 — posShifts.ts (added under T-0012) inherited
  // the same `Date.now()`-as-id pattern as orders.ts/returns.ts. It now uses
  // the shared `generateId()` helper (electron/storage/generateId.ts), so two
  // saves in the same millisecond no longer collide.
  it('FIXED (T-0022): two saves in the same millisecond get distinct IDs', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    let queue: any[] = [];
    readFile.mockImplementation(async () => JSON.stringify(queue));
    writeFile.mockImplementation(async (_path: string, data: string) => {
      queue = JSON.parse(data);
    });

    const [idA, idB] = await Promise.all([
      saveOfflineShiftAction(openAction({ clientShiftKey: 'key-a' })),
      saveOfflineShiftAction(openAction({ clientShiftKey: 'key-b' })),
    ]);

    expect(idA).not.toBe(idB);
    expect(new Set(queue.map((a) => a.id)).size).toBe(queue.length);
  });
});
