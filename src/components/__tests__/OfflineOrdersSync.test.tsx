import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineOrdersSync } from '../OfflineOrdersSync';
import { useAuthStore } from '../../store/authStore';
import { usePosShiftStore, type LocalPosShift } from '../../store/posShiftStore';

// این تست دقیقاً همان باگی را می‌پوشاند که code-reviewer در T-0012 پیدا کرد:
// syncPosShifts در preload/main.ts تعریف و پیاده‌سازی شده بود، ولی هیچ‌جای
// renderer صدایش نمی‌زد — یعنی یک شیفتِ باز/بسته‌شدهٔ آفلاین برای همیشه
// pendingSync می‌ماند. این تست تضمین می‌کند OfflineOrdersSync واقعاً صدایش
// می‌زند و پس از موفقیت، currentShift را دوباره از سرور می‌خواند تا
// pendingSync در UI بدون رفرش دستی پاک شود.

const pendingShift: LocalPosShift = {
  id: null,
  clientShiftKey: 'client-key-1',
  restaurantId: 7,
  openingFloatAmount: 1000000,
  openingNotes: null,
  status: 'open',
  countedCashAmount: null,
  expectedCashAmount: null,
  varianceAmount: null,
  closingNotes: null,
  openedAt: '2026-09-08T08:00:00.000Z',
  closedAt: null,
  pendingSync: true,
};

describe('OfflineOrdersSync — pos-shift wiring', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'live-token',
      user: { id: 1, mobile: '09120000000', restaurants: [{ id: 7 }] },
    });
    usePosShiftStore.setState({ currentShift: pendingShift, loading: false, error: null });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, user: null });
    usePosShiftStore.setState({ currentShift: null, loading: false, error: null });
  });

  it('calls window.electronAPI.syncPosShifts on the initial sync pass', async () => {
    const syncPosShifts = vi.fn().mockResolvedValue({ success: 1, failed: 0, errors: [] });
    window.electronAPI = {
      ...window.electronAPI,
      checkOnline: vi.fn().mockResolvedValue(true),
      syncOrders: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
      syncReturns: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
      syncPosShifts,
    } as typeof window.electronAPI;

    render(<OfflineOrdersSync />);

    await waitFor(() => expect(syncPosShifts).toHaveBeenCalledWith('live-token'));
  });

  it('re-fetches currentShift after a successful sync so pendingSync clears without a manual reload', async () => {
    const loadCurrentShift = vi.fn().mockResolvedValue(undefined);
    usePosShiftStore.setState({ loadCurrentShift });

    window.electronAPI = {
      ...window.electronAPI,
      checkOnline: vi.fn().mockResolvedValue(true),
      syncOrders: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
      syncReturns: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
      syncPosShifts: vi.fn().mockResolvedValue({ success: 1, failed: 0, errors: [] }),
    } as typeof window.electronAPI;

    render(<OfflineOrdersSync />);

    await waitFor(() => expect(loadCurrentShift).toHaveBeenCalledWith(7, 'live-token'));
  });

  it('does not re-fetch currentShift when nothing was pending sync', async () => {
    usePosShiftStore.setState({ currentShift: { ...pendingShift, pendingSync: false } });
    const loadCurrentShift = vi.fn().mockResolvedValue(undefined);
    usePosShiftStore.setState({ loadCurrentShift });

    window.electronAPI = {
      ...window.electronAPI,
      checkOnline: vi.fn().mockResolvedValue(true),
      syncOrders: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
      syncReturns: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
      syncPosShifts: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
    } as typeof window.electronAPI;

    render(<OfflineOrdersSync />);

    // یک تیک برای اجرای effect اولیه صبر می‌کنیم؛ چون success صفر است نباید loadCurrentShift صدا زده شود
    await waitFor(() => expect(window.electronAPI.syncPosShifts).toHaveBeenCalled());
    expect(loadCurrentShift).not.toHaveBeenCalled();
  });
});
