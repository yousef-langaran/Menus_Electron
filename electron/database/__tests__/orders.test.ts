import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Follows the same mocking convention as electron/storage/__tests__/jsonStore.test.ts:
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
  saveOfflineOrder,
  getOfflineOrders,
  getAllOrders,
  markOrderAsSynced,
  deleteOrder,
} = await import('../orders');

const enoent = () => Object.assign(new Error('not found'), { code: 'ENOENT' });

/** Reads back whatever the module most recently wrote to disk (all writes are full-file rewrites). */
function lastWritten(): any[] {
  const lastCall = writeFile.mock.calls.at(-1);
  return JSON.parse(lastCall![1] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  readFile.mockRejectedValue(enoent()); // empty queue by default
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveOfflineOrder / getOfflineOrders / getAllOrders', () => {
  it('appends a new unsynced order to an empty queue', async () => {
    const id = await saveOfflineOrder({ items: [{ id: 1 }] }, 'tok-1', 'https://api.example.com');

    expect(typeof id).toBe('number');
    const written = lastWritten();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      id,
      orderData: { items: [{ id: 1 }] },
      token: 'tok-1',
      baseURL: 'https://api.example.com',
      synced: false,
    });
    expect(mkdir).toHaveBeenCalled();
  });

  it('appends to (never overwrites) an existing queue on disk', async () => {
    const existing = [
      { id: 1, orderData: {}, token: 't', createdAt: '2026-01-01T00:00:00.000Z', synced: false },
    ];
    readFile.mockResolvedValue(JSON.stringify(existing));

    await saveOfflineOrder({ items: [] }, 'tok-2');

    const written = lastWritten();
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(existing[0]);
  });

  it('getOfflineOrders returns only the unsynced rows', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, orderData: {}, token: 't', createdAt: 'a', synced: true },
        { id: 2, orderData: {}, token: 't', createdAt: 'b', synced: false },
      ]),
    );

    const pending = await getOfflineOrders();
    expect(pending).toEqual([{ id: 2, orderData: {}, token: 't', createdAt: 'b', synced: false }]);
  });

  it('getAllOrders returns every row (synced and unsynced), newest first', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, orderData: {}, token: 't', createdAt: '2026-01-01T00:00:00.000Z', synced: true },
        { id: 2, orderData: {}, token: 't', createdAt: '2026-06-01T00:00:00.000Z', synced: false },
      ]),
    );

    const all = await getAllOrders();
    expect(all.map((o) => o.id)).toEqual([2, 1]);
  });

  it('treats a missing queue file as an empty queue rather than an error', async () => {
    readFile.mockRejectedValue(enoent());
    await expect(getAllOrders()).resolves.toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('treats a corrupted queue file as empty and logs it, rather than crashing the main process', async () => {
    readFile.mockResolvedValue('{ not json');
    await expect(getAllOrders()).resolves.toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('markOrderAsSynced', () => {
  it('marks only the matching order as synced, leaving others untouched', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, orderData: {}, token: 't', createdAt: 'a', synced: false },
        { id: 2, orderData: {}, token: 't', createdAt: 'b', synced: false },
      ]),
    );

    await markOrderAsSynced(1);

    const written = lastWritten();
    expect(written.find((o: any) => o.id === 1)).toMatchObject({ synced: true });
    expect(written.find((o: any) => o.id === 1).syncedAt).toEqual(expect.any(String));
    expect(written.find((o: any) => o.id === 2)).toMatchObject({ synced: false });
  });

  it('is a no-op (no write) when the ID is not found', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([{ id: 1, orderData: {}, token: 't', createdAt: 'a', synced: false }]),
    );

    await markOrderAsSynced(999);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('deleteOrder', () => {
  it('removes only the matching order', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        { id: 1, orderData: {}, token: 't', createdAt: 'a', synced: true },
        { id: 2, orderData: {}, token: 't', createdAt: 'b', synced: false },
      ]),
    );

    await deleteOrder(1);

    const written = lastWritten();
    expect(written.map((o: any) => o.id)).toEqual([2]);
  });

  it('is a no-op (no write) when the ID is not found', async () => {
    readFile.mockResolvedValue(
      JSON.stringify([{ id: 1, orderData: {}, token: 't', createdAt: 'a', synced: false }]),
    );

    await deleteOrder(999);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('concurrent writes are serialized through the internal lock', () => {
  it('does not lose an order when two saves race on the same read-modify-write cycle', async () => {
    // Simulate a slow disk: readFile takes a tick to resolve, so if the two
    // saves were NOT serialized, both would read the same (empty) snapshot
    // and the second write would clobber the first.
    let queue: any[] = [];
    readFile.mockImplementation(async () => {
      await Promise.resolve();
      return JSON.stringify(queue);
    });
    writeFile.mockImplementation(async (_path: string, data: string) => {
      queue = JSON.parse(data);
    });

    await Promise.all([
      saveOfflineOrder({ items: [{ id: 'a' }] }, 'tok'),
      saveOfflineOrder({ items: [{ id: 'b' }] }, 'tok'),
    ]);

    expect(queue).toHaveLength(2);
  });

  // Regression test for T-0022 (previously a KNOWN LIVE BUG documented under
  // T-0013 QA, kept green via `it.fails`). `saveOfflineOrder` now derives its
  // id from the shared `generateId()` helper (electron/storage/generateId.ts)
  // — a monotonic counter seeded by `Date.now()` — instead of calling
  // `Date.now()` directly, so two saves that land in the same millisecond no
  // longer collide, and `markOrderAsSynced`/`deleteOrder` (which key off
  // `Array.findIndex`/`filter` by id) can no longer act ambiguously on a
  // colliding pair.
  it('FIXED (T-0022): two saves in the same millisecond get distinct IDs', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    let queue: any[] = [];
    readFile.mockImplementation(async () => JSON.stringify(queue));
    writeFile.mockImplementation(async (_path: string, data: string) => {
      queue = JSON.parse(data);
    });

    const [idA, idB] = await Promise.all([
      saveOfflineOrder({ items: [{ id: 'a' }] }, 'tok'),
      saveOfflineOrder({ items: [{ id: 'b' }] }, 'tok'),
    ]);

    // Desired: every queued order has a unique id, so sync/delete/mark
    // operations by id are unambiguous.
    expect(idA).not.toBe(idB);
    expect(new Set(queue.map((o) => o.id)).size).toBe(queue.length);
  });
});
