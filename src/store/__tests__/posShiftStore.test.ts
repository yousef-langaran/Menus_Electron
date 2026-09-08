import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePosShiftStore } from '../posShiftStore';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  openPosShift: vi.fn(),
  closePosShift: vi.fn(),
  getCurrentPosShift: vi.fn(),
  getPosShiftReport: vi.fn(),
  getApiBaseUrl: vi.fn(() => 'https://api.test/api/v1'),
}));

const initialState = usePosShiftStore.getState();

function setOnline(value: boolean) {
  (window as any).electronAPI = {
    ...(window as any).electronAPI,
    checkOnline: vi.fn().mockResolvedValue(value),
  };
}

function mockOfflineQueueBridge() {
  const saveOfflinePosShiftAction = vi.fn().mockResolvedValue({ success: true, id: 123 });
  (window as any).electronAPI = { ...(window as any).electronAPI, saveOfflinePosShiftAction };
  return saveOfflinePosShiftAction;
}

const sampleShiftRow = (overrides: Partial<api.PosShiftRow> = {}): api.PosShiftRow => ({
  id: 1,
  restaurantId: 7,
  clientShiftKey: 'key-1',
  openedByUserId: 5,
  closedByUserId: null,
  openingFloatAmount: 500000,
  countedCashAmount: null,
  expectedCashAmount: null,
  varianceAmount: null,
  status: 'open',
  openingNotes: null,
  closingNotes: null,
  openedAt: '2026-09-06T08:00:00.000Z',
  closedAt: null,
  createdAt: '2026-09-06T08:00:00.000Z',
  updatedAt: '2026-09-06T08:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  usePosShiftStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe('usePosShiftStore', () => {
  it('starts with no current shift', () => {
    const state = usePosShiftStore.getState();
    expect(state.currentShift).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('opens a shift online and stores the server-confirmed record (not pending sync)', async () => {
    setOnline(true);
    (api.openPosShift as any).mockResolvedValue(sampleShiftRow());

    const result = await usePosShiftStore
      .getState()
      .openShift({ restaurantId: 7, openingFloatAmount: 500000, token: 'tok' });

    expect(result.success).toBe(true);
    const shift = usePosShiftStore.getState().currentShift;
    expect(shift?.id).toBe(1);
    expect(shift?.pendingSync).toBe(false);
    expect(shift?.status).toBe('open');
  });

  it('surfaces a server rejection (e.g. shift already open) as an error, without an optimistic shift', async () => {
    setOnline(true);
    (api.openPosShift as any).mockRejectedValue({
      response: { status: 409, data: { message: 'یک شیفت باز برای این رستوران از قبل وجود دارد' } },
    });

    const result = await usePosShiftStore
      .getState()
      .openShift({ restaurantId: 7, openingFloatAmount: 500000, token: 'tok' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('شیفت باز');
    expect(usePosShiftStore.getState().currentShift).toBeNull();
  });

  it('queues the open action offline (network error) and keeps the cashier unblocked with an optimistic shift', async () => {
    setOnline(true);
    const saveOfflineAction = mockOfflineQueueBridge();
    (api.openPosShift as any).mockRejectedValue({ request: {}, response: undefined });

    const result = await usePosShiftStore
      .getState()
      .openShift({ restaurantId: 7, openingFloatAmount: 300000, openingNotes: 'شروع شیفت صبح', token: 'tok' });

    expect(result.success).toBe(true);
    expect(saveOfflineAction).toHaveBeenCalledTimes(1);
    const [queuedAction] = saveOfflineAction.mock.calls[0];
    expect(queuedAction.type).toBe('open');
    expect(queuedAction.restaurantId).toBe(7);

    const shift = usePosShiftStore.getState().currentShift;
    expect(shift?.id).toBeNull();
    expect(shift?.pendingSync).toBe(true);
    expect(shift?.status).toBe('open');
    expect(shift?.openingFloatAmount).toBe(300000);
  });

  it('queues directly (without calling the API) when already offline', async () => {
    setOnline(false);
    const saveOfflineAction = mockOfflineQueueBridge();

    await usePosShiftStore.getState().openShift({ restaurantId: 7, openingFloatAmount: 200000, token: 'tok' });

    expect(api.openPosShift).not.toHaveBeenCalled();
    expect(saveOfflineAction).toHaveBeenCalledTimes(1);
    expect(usePosShiftStore.getState().currentShift?.pendingSync).toBe(true);
  });

  it('rejects closing when there is no open shift', async () => {
    const result = await usePosShiftStore.getState().closeShift({ countedCashAmount: 100000, token: 'tok' });
    expect(result.success).toBe(false);
  });

  it('closes an online, already-synced shift by calling the server and clears pendingSync', async () => {
    setOnline(true);
    (api.openPosShift as any).mockResolvedValue(sampleShiftRow());
    await usePosShiftStore.getState().openShift({ restaurantId: 7, openingFloatAmount: 500000, token: 'tok' });

    (api.closePosShift as any).mockResolvedValue(
      sampleShiftRow({
        status: 'closed',
        countedCashAmount: 520000,
        expectedCashAmount: 500000,
        varianceAmount: 20000,
        closedAt: '2026-09-06T16:00:00.000Z',
      }),
    );

    const result = await usePosShiftStore.getState().closeShift({ countedCashAmount: 520000, token: 'tok' });

    expect(result.success).toBe(true);
    const shift = usePosShiftStore.getState().currentShift;
    expect(shift?.status).toBe('closed');
    expect(shift?.varianceAmount).toBe(20000);
    expect(shift?.pendingSync).toBe(false);
  });

  it('queues a close for a shift that was opened offline and never got a server id, even while online', async () => {
    setOnline(false);
    mockOfflineQueueBridge();
    await usePosShiftStore.getState().openShift({ restaurantId: 7, openingFloatAmount: 400000, token: 'tok' });
    expect(usePosShiftStore.getState().currentShift?.id).toBeNull();

    // Cashier comes back online mid-shift, but the open itself has not synced yet
    setOnline(true);
    const saveOfflineAction = mockOfflineQueueBridge();

    const result = await usePosShiftStore.getState().closeShift({ countedCashAmount: 410000, token: 'tok' });

    expect(result.success).toBe(true);
    expect(api.closePosShift).not.toHaveBeenCalled();
    expect(saveOfflineAction).toHaveBeenCalledTimes(1);
    const [queuedAction] = saveOfflineAction.mock.calls[0];
    expect(queuedAction.type).toBe('close');
    expect(queuedAction.serverShiftId).toBeNull();

    const shift = usePosShiftStore.getState().currentShift;
    expect(shift?.status).toBe('closed');
    expect(shift?.pendingSync).toBe(true);
    // Expected/variance can't be known locally — must wait for server-side sync
    expect(shift?.expectedCashAmount).toBeNull();
  });

  it('fetchReport returns null when there is no synced shift yet', async () => {
    const report = await usePosShiftStore.getState().fetchReport('x', 'tok');
    expect(report).toBeNull();
    expect(api.getPosShiftReport).not.toHaveBeenCalled();
  });

  it('fetchReport delegates to the API once a shift has a server id', async () => {
    setOnline(true);
    (api.openPosShift as any).mockResolvedValue(sampleShiftRow());
    await usePosShiftStore.getState().openShift({ restaurantId: 7, openingFloatAmount: 500000, token: 'tok' });

    const fakeReport = { shiftId: 1 } as any;
    (api.getPosShiftReport as any).mockResolvedValue(fakeReport);

    const report = await usePosShiftStore.getState().fetchReport('x', 'tok');
    expect(report).toBe(fakeReport);
    expect(api.getPosShiftReport).toHaveBeenCalledWith(1, 7, 'x', 'tok');
  });

  it('loadCurrentShift preserves a pending offline shift instead of clearing it when the server has no open shift yet', async () => {
    setOnline(false);
    mockOfflineQueueBridge();
    await usePosShiftStore.getState().openShift({ restaurantId: 7, openingFloatAmount: 250000, token: 'tok' });

    setOnline(true);
    (api.getCurrentPosShift as any).mockResolvedValue(null);

    await usePosShiftStore.getState().loadCurrentShift(7, 'tok');

    expect(usePosShiftStore.getState().currentShift?.pendingSync).toBe(true);
  });

  it('clearError resets the error field', () => {
    usePosShiftStore.setState({ error: 'something went wrong' });
    usePosShiftStore.getState().clearError();
    expect(usePosShiftStore.getState().error).toBeNull();
  });
});
