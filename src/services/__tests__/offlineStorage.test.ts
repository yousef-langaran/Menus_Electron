import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllOrders, saveOfflineOrder } from '../offlineStorage';

describe('offlineStorage (renderer-side offline order queue)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // The module under test intentionally logs these expected fallback paths
    // with console.error; keep test output clean without hiding assertions.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Start each test from a clean electronAPI without the two methods this
    // module cares about, so tests explicitly opt into the electron-bridge
    // path instead of silently depending on vitest.setup's base stub.
    delete (window.electronAPI as any).saveOfflineOrder;
    delete (window.electronAPI as any).getOfflineOrders;
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveOfflineOrder', () => {
    it('delegates to the electron bridge and returns its orderId when available', async () => {
      (window.electronAPI as any).saveOfflineOrder = vi
        .fn()
        .mockResolvedValue({ success: true, orderId: 123 });

      const id = await saveOfflineOrder({ items: [{ id: 1 }] }, 'tok', 'https://api.example.com');

      expect(id).toBe(123);
      expect((window.electronAPI as any).saveOfflineOrder).toHaveBeenCalledWith(
        { items: [{ id: 1 }] },
        'tok',
        'https://api.example.com',
      );
      // Must not also write to the localStorage fallback queue when the
      // electron bridge succeeded — that would leave a duplicate copy of
      // the same order sitting in two different queues.
      expect(localStorage.getItem('offlineOrders')).toBeNull();
    });

    it('falls back to localStorage when the electron bridge call throws', async () => {
      (window.electronAPI as any).saveOfflineOrder = vi.fn().mockRejectedValue(new Error('IPC down'));

      const id = await saveOfflineOrder({ items: [{ id: 2 }] }, 'tok');

      expect(typeof id).toBe('number');
      const stored = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id, token: 'tok', synced: false });
    });

    it('falls back to localStorage when the electron bridge reports failure without a orderId', async () => {
      (window.electronAPI as any).saveOfflineOrder = vi
        .fn()
        .mockResolvedValue({ success: false });

      const id = await saveOfflineOrder({ items: [{ id: 3 }] }, 'tok');

      const stored = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(id);
    });

    it('uses the localStorage queue directly when there is no electron bridge at all (web fallback)', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI');
      // @ts-expect-error simulating a plain-web (non-Electron) environment
      delete window.electronAPI;
      try {
        const id = await saveOfflineOrder({ items: [{ id: 4 }] }, 'tok');
        const stored = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe(id);
      } finally {
        if (originalDescriptor) Object.defineProperty(window, 'electronAPI', originalDescriptor);
      }
    });

    it('appends to (rather than overwrites) an existing localStorage queue', async () => {
      localStorage.setItem(
        'offlineOrders',
        JSON.stringify([{ id: 1, orderData: {}, token: 't', createdAt: 'x', synced: false }]),
      );
      (window.electronAPI as any).saveOfflineOrder = vi.fn().mockRejectedValue(new Error('IPC down'));

      await saveOfflineOrder({ items: [{ id: 5 }] }, 'tok');

      const stored = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
      expect(stored).toHaveLength(2);
    });
  });

  describe('getAllOrders', () => {
    it('delegates to the electron bridge when available', async () => {
      const orders = [{ id: 1, orderData: {}, token: 't', createdAt: 'x', synced: false }];
      (window.electronAPI as any).getOfflineOrders = vi.fn().mockResolvedValue(orders);

      await expect(getAllOrders()).resolves.toEqual(orders);
    });

    it('falls back to the localStorage queue when the electron bridge call throws', async () => {
      (window.electronAPI as any).getOfflineOrders = vi.fn().mockRejectedValue(new Error('IPC down'));
      const orders = [{ id: 2, orderData: {}, token: 't', createdAt: 'x', synced: false }];
      localStorage.setItem('offlineOrders', JSON.stringify(orders));

      await expect(getAllOrders()).resolves.toEqual(orders);
    });

    it('returns an empty array when there is no bridge and the localStorage queue is empty or corrupted', async () => {
      await expect(getAllOrders()).resolves.toEqual([]);

      localStorage.setItem('offlineOrders', '{ not json');
      await expect(getAllOrders()).resolves.toEqual([]);
    });
  });
});
