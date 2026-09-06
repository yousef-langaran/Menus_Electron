import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// electron/services/sync.ts is the piece of the offline-sync architecture
// that actually implements the "concurrency capped at 3" POST behavior the
// electron-offline-sync skill documents for the orders/returns JSON queue —
// orders.ts/returns.ts only store the queue, they don't push it.
const post = vi.fn();
vi.mock('axios', () => ({ default: { post } }));

vi.mock('../../database/orders', () => ({
  getOfflineOrders: vi.fn(),
  markOrderAsSynced: vi.fn(),
}));
vi.mock('../../database/returns', () => ({
  getOfflineReturns: vi.fn(),
  markReturnAsSynced: vi.fn(),
}));
vi.mock('../../config/api', () => ({
  getApiConfig: vi.fn(() => ({ baseURL: 'https://default.example.com/api/v1' })),
}));
vi.mock('../../database/preferences', () => ({
  loadUserSession: vi.fn(),
}));

import * as ordersDb from '../../database/orders';
import * as returnsDb from '../../database/returns';
import * as preferences from '../../database/preferences';
// Dynamic import (not a static one) so it executes here, after `post` above
// has been initialized — a static import would be hoisted by ESM semantics
// above this file's own `const post = vi.fn()`, which the axios mock factory
// closes over, causing a "Cannot access 'post' before initialization" TDZ
// error. Same reasoning as the `await import(...)` used in
// electron/storage/__tests__/jsonStore.test.ts and this ticket's other
// electron/database test files.
const { syncOfflineOrders, syncOfflineReturns } = await import('../sync');

/** Builds a fake (unsigned, test-only) JWT with the given `iat` claim. */
function fakeJwt(iat: number): string {
  const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ iat })}.sig`;
}

function makeOrder(overrides: Partial<any> = {}) {
  return {
    id: 1,
    orderData: { items: [{ id: 1, qty: 1 }] },
    token: 'order-token',
    createdAt: new Date().toISOString(),
    synced: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (preferences.loadUserSession as any).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncOfflineOrders concurrency cap', () => {
  it('never has more than 3 order POSTs in flight at once', async () => {
    const orders = Array.from({ length: 7 }, (_, i) => makeOrder({ id: i + 1 }));
    (ordersDb.getOfflineOrders as any).mockResolvedValue(orders);

    let inFlight = 0;
    let maxInFlight = 0;
    post.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { data: { id: 999 } };
    });

    const result = await syncOfflineOrders();

    expect(post).toHaveBeenCalledTimes(7);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(result.success).toBe(7);
    expect(ordersDb.markOrderAsSynced).toHaveBeenCalledTimes(7);
  });
});

describe('syncOfflineOrders auth token resolution', () => {
  it('uses the explicit override token and the current default baseURL, ignoring the order-stored baseURL', async () => {
    (ordersDb.getOfflineOrders as any).mockResolvedValue([
      makeOrder({ baseURL: 'https://old-stale-server.example.com/api/v1' }),
    ]);
    post.mockResolvedValue({ data: { id: 1 } });

    await syncOfflineOrders('override-token');

    expect(post).toHaveBeenCalledWith(
      'https://default.example.com/api/v1/orders',
      expect.anything(),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer override-token' }) }),
    );
  });

  it('without an override, picks whichever of the session/order token has the newer `iat`', async () => {
    const olderToken = fakeJwt(1000);
    const newerToken = fakeJwt(2000);
    (preferences.loadUserSession as any).mockResolvedValue({ token: newerToken });
    (ordersDb.getOfflineOrders as any).mockResolvedValue([makeOrder({ token: olderToken })]);
    post.mockResolvedValue({ data: { id: 1 } });

    await syncOfflineOrders();

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${newerToken}` }) }),
    );
  });

  it('without an override, keeps the order-stored token when it is newer than the current session token', async () => {
    const olderSessionToken = fakeJwt(1000);
    const newerOrderToken = fakeJwt(2000);
    (preferences.loadUserSession as any).mockResolvedValue({ token: olderSessionToken });
    (ordersDb.getOfflineOrders as any).mockResolvedValue([makeOrder({ token: newerOrderToken })]);
    post.mockResolvedValue({ data: { id: 1 } });

    await syncOfflineOrders();

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${newerOrderToken}` }) }),
    );
  });
});

describe('syncOfflineOrders per-order outcomes', () => {
  it('marks an item-less order as synced (never resent) but still reports it as failed', async () => {
    (ordersDb.getOfflineOrders as any).mockResolvedValue([makeOrder({ orderData: { items: [] } })]);

    const result = await syncOfflineOrders();

    expect(post).not.toHaveBeenCalled();
    expect(ordersDb.markOrderAsSynced).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({ success: 0, failed: 1 });
  });

  it('reports a distinct Unauthorized message on 401 without marking the order as synced (it must be retried after re-login)', async () => {
    (ordersDb.getOfflineOrders as any).mockResolvedValue([makeOrder()]);
    post.mockRejectedValue({ response: { status: 401 } });

    const result = await syncOfflineOrders();

    expect(ordersDb.markOrderAsSynced).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('Unauthorized');
  });

  it('does nothing when the offline queue is empty', async () => {
    (ordersDb.getOfflineOrders as any).mockResolvedValue([]);
    const result = await syncOfflineOrders();
    expect(result).toEqual({ success: 0, failed: 0, errors: [] });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('syncOfflineReturns', () => {
  it('never has more than 3 return POSTs in flight, and posts to /order-returns', async () => {
    const returns = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      returnData: { items: [{ id: 1 }] },
      token: 'ret-token',
      createdAt: new Date().toISOString(),
      synced: false,
    }));
    (returnsDb.getOfflineReturns as any).mockResolvedValue(returns);

    let inFlight = 0;
    let maxInFlight = 0;
    post.mockImplementation(async (url: string) => {
      expect(url).toContain('/order-returns');
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { data: { id: 1 } };
    });

    const result = await syncOfflineReturns();

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(result.success).toBe(5);
    expect(returnsDb.markReturnAsSynced).toHaveBeenCalledTimes(5);
  });
});
