import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors electron/database/__tests__/orders.test.ts — returns.ts is the
// same JSON-file offline queue pattern applied to order returns.
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
  saveOfflineReturn,
  getOfflineReturns,
  getAllReturns,
  markReturnAsSynced,
  deleteReturn,
} = await import('../returns');

const enoent = () => Object.assign(new Error('not found'), { code: 'ENOENT' });

function lastWritten(): any[] {
  const lastCall = writeFile.mock.calls.at(-1);
  return JSON.parse(lastCall![1] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  readFile.mockRejectedValue(enoent());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveOfflineReturn / getOfflineReturns / getAllReturns', () => {
  it('appends a new unsynced return to an empty queue', async () => {
    const id = await saveOfflineReturn({ items: [{ id: 1 }] }, 'tok-1', 'https://api.example.com');

    const written = lastWritten();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      id,
      returnData: { items: [{ id: 1 }] },
      token: 'tok-1',
      baseURL: 'https://api.example.com',
      synced: false,
    });
  });

  it('appends to (never overwrites) an existing queue on disk', async () => {
    const existing = [
      { id: 1, returnData: {}, token: 't', createdAt: '2026-01-01T00:00:00.000Z', synced: false },
    ];
    readFile.mockResolvedValue(JSON.stringify(existing));

    await saveOfflineReturn({ items: [] }, 'tok-2');

    const written = lastWritten();
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(existing[0]);
  });

  it('getOfflineReturns returns only the unsynced rows', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, returnData: {}, token: 't', createdAt: 'a', synced: true },
        { id: 2, returnData: {}, token: 't', createdAt: 'b', synced: false },
      ]),
    );

    const pending = await getOfflineReturns();
    expect(pending).toEqual([{ id: 2, returnData: {}, token: 't', createdAt: 'b', synced: false }]);
  });

  it('getAllReturns returns every row, newest first', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, returnData: {}, token: 't', createdAt: '2026-01-01T00:00:00.000Z', synced: true },
        { id: 2, returnData: {}, token: 't', createdAt: '2026-06-01T00:00:00.000Z', synced: false },
      ]),
    );

    const all = await getAllReturns();
    expect(all.map((r) => r.id)).toEqual([2, 1]);
  });

  it('treats a missing queue file as an empty queue rather than an error', async () => {
    readFile.mockRejectedValue(enoent());
    await expect(getAllReturns()).resolves.toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('treats a corrupted queue file as empty and logs it, rather than crashing the main process', async () => {
    readFile.mockResolvedValue('{ not json');
    await expect(getAllReturns()).resolves.toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('markReturnAsSynced', () => {
  it('marks only the matching return as synced, leaving others untouched', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, returnData: {}, token: 't', createdAt: 'a', synced: false },
        { id: 2, returnData: {}, token: 't', createdAt: 'b', synced: false },
      ]),
    );

    await markReturnAsSynced(1);

    const written = lastWritten();
    expect(written.find((r: any) => r.id === 1)).toMatchObject({ synced: true });
    expect(written.find((r: any) => r.id === 2)).toMatchObject({ synced: false });
  });

  it('is a no-op (no write) when the ID is not found', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([{ id: 1, returnData: {}, token: 't', createdAt: 'a', synced: false }]),
    );

    await markReturnAsSynced(999);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('deleteReturn', () => {
  it('removes only the matching return', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, returnData: {}, token: 't', createdAt: 'a', synced: true },
        { id: 2, returnData: {}, token: 't', createdAt: 'b', synced: false },
      ]),
    );

    await deleteReturn(1);

    const written = lastWritten();
    expect(written.map((r: any) => r.id)).toEqual([2]);
  });

  it('is a no-op (no write) when the ID is not found', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([{ id: 1, returnData: {}, token: 't', createdAt: 'a', synced: false }]),
    );

    await deleteReturn(999);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('concurrent writes are serialized through the internal lock', () => {
  it('does not lose a return when two saves race on the same read-modify-write cycle', async () => {
    let queue: any[] = [];
    readFile.mockImplementation(async () => {
      await Promise.resolve();
      return JSON.stringify(queue);
    });
    writeFile.mockImplementation(async (_path: string, data: string) => {
      queue = JSON.parse(data);
    });

    await Promise.all([
      saveOfflineReturn({ items: [{ id: 'a' }] }, 'tok'),
      saveOfflineReturn({ items: [{ id: 'b' }] }, 'tok'),
    ]);

    expect(queue).toHaveLength(2);
  });

  // Regression test for T-0022 (previously a KNOWN LIVE BUG documented under
  // T-0013 QA, kept green via `it.fails`). Same fix as electron/database/
  // orders.ts: `saveOfflineReturn` now derives its id from the shared
  // `generateId()` helper (electron/storage/generateId.ts) instead of
  // calling `Date.now()` directly, so two saves in the same millisecond no
  // longer collide.
  it('FIXED (T-0022): two saves in the same millisecond get distinct IDs', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    let queue: any[] = [];
    readFile.mockImplementation(async () => JSON.stringify(queue));
    writeFile.mockImplementation(async (_path: string, data: string) => {
      queue = JSON.parse(data);
    });

    const [idA, idB] = await Promise.all([
      saveOfflineReturn({ items: [{ id: 'a' }] }, 'tok'),
      saveOfflineReturn({ items: [{ id: 'b' }] }, 'tok'),
    ]);

    expect(idA).not.toBe(idB);
    expect(new Set(queue.map((r) => r.id)).size).toBe(queue.length);
  });
});
