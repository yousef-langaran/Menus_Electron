import { create } from 'zustand';
import {
  openPosShift,
  closePosShift,
  getCurrentPosShift,
  getPosShiftReport,
  getApiBaseUrl,
  type PosShiftRow,
  type PosShiftReport,
} from '../services/api';

export type LocalPosShiftStatus = 'open' | 'closed';

/**
 * نمایهٔ محلیِ شیفت صندوق در Zustand. برخلاف orderStore که فقط یک شناسهٔ سفارش
 * آفلاین برمی‌گرداند، این‌جا کل شیء شیفت لازم است (برای نمایش فوری در UI)، پس
 * وقتی آفلاین باز می‌شود یک نسخهٔ optimistic نگه داشته می‌شود تا sync شدن واقعی
 * (رجوع کنید به `pendingSync`).
 */
export interface LocalPosShift {
  /** شناسهٔ سرور — اگر شیفت آفلاین باز شده و هنوز sync نشده باشد null است */
  id: number | null;
  clientShiftKey: string;
  restaurantId: number;
  openingFloatAmount: number;
  openingNotes: string | null;
  status: LocalPosShiftStatus;
  countedCashAmount: number | null;
  expectedCashAmount: number | null;
  varianceAmount: number | null;
  closingNotes: string | null;
  openedAt: string;
  closedAt: string | null;
  /** true تا وقتی سرور اکشن (باز/بستن) را تأیید کند — از صف آفلاین می‌آید */
  pendingSync: boolean;
}

interface PosShiftState {
  currentShift: LocalPosShift | null;
  loading: boolean;
  error: string | null;
  loadCurrentShift: (restaurantId: number, token: string) => Promise<void>;
  openShift: (params: {
    restaurantId: number;
    openingFloatAmount: number;
    openingNotes?: string;
    token: string;
  }) => Promise<{ success: boolean; error?: string }>;
  closeShift: (params: {
    countedCashAmount: number;
    closingNotes?: string;
    token: string;
  }) => Promise<{ success: boolean; error?: string; shift?: LocalPosShift }>;
  fetchReport: (type: 'x' | 'z', token: string) => Promise<PosShiftReport | null>;
  clearError: () => void;
  reset: () => void;
}

function generateClientShiftKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `shift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function checkOnline(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.checkOnline) {
    try {
      return await window.electronAPI.checkOnline();
    } catch {
      /* fall through to navigator.onLine */
    }
  }
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** خطای شبکه (بدون پاسخ سرور) در برابر رد منطقی سرور (400/409/...) — فقط اولی باید صف‌بندی آفلاین کند */
function isNetworkError(error: any): boolean {
  return !error?.response && !!error?.request;
}

function extractErrorMessage(error: any, fallback: string): string {
  const m = error?.response?.data?.message;
  if (Array.isArray(m)) return m.join(' — ');
  if (typeof m === 'string' && m.trim()) return m.trim();
  return fallback;
}

function toLocalShift(shift: PosShiftRow, pendingSync: boolean): LocalPosShift {
  return {
    id: shift.id,
    clientShiftKey: shift.clientShiftKey || '',
    restaurantId: shift.restaurantId,
    openingFloatAmount: Number(shift.openingFloatAmount) || 0,
    openingNotes: shift.openingNotes,
    status: shift.status,
    countedCashAmount: shift.countedCashAmount != null ? Number(shift.countedCashAmount) : null,
    expectedCashAmount: shift.expectedCashAmount != null ? Number(shift.expectedCashAmount) : null,
    varianceAmount: shift.varianceAmount != null ? Number(shift.varianceAmount) : null,
    closingNotes: shift.closingNotes,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    pendingSync,
  };
}

/**
 * شیفت را در صف آفلاین قرار می‌دهد — همان الگوی JSON-queue سفارش/مرجوعی
 * (electron/database/orders.ts و returns.ts)، از طریق IPC اگر در الکترون
 * هستیم، وگرنه یک fallback ساده روی localStorage (مشابه services/offlineStorage.ts)
 * تا حتی خارج از الکترون (مثلاً در تست/مرورگر) صندوق‌دار مسدود نشود.
 */
async function queueShiftAction(action: {
  type: 'open' | 'close';
  clientShiftKey: string;
  restaurantId: number;
  payload: Record<string, unknown>;
  serverShiftId: number | null;
  token: string;
  baseURL?: string;
}): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI?.saveOfflinePosShiftAction) {
    try {
      const res = await window.electronAPI.saveOfflinePosShiftAction(action);
      if (res?.success) return;
    } catch (error) {
      console.error('Failed to queue pos-shift action via electron API:', error);
    }
  }
  try {
    const key = 'offlinePosShiftActions';
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    const actions = raw ? JSON.parse(raw) : [];
    actions.push({ ...action, id: Date.now(), createdAt: new Date().toISOString(), synced: false });
    window.localStorage.setItem(key, JSON.stringify(actions));
  } catch (error) {
    console.error('Failed to queue pos-shift action (fallback):', error);
  }
}

export const usePosShiftStore = create<PosShiftState>((set, get) => ({
  currentShift: null,
  loading: false,
  error: null,

  loadCurrentShift: async (restaurantId, token) => {
    set({ loading: true, error: null });
    try {
      const online = await checkOnline();
      if (!online) {
        set({ loading: false });
        return;
      }
      const shift = await getCurrentPosShift(restaurantId, token);
      const localPending = get().currentShift;
      if (!shift) {
        // اگر یک شیفت آفلاین در انتظار sync داریم، حذفش نکن — سرور هنوز رکوردی از آن ندارد
        if (localPending?.pendingSync) {
          set({ loading: false });
          return;
        }
        set({ currentShift: null, loading: false });
        return;
      }
      set({ currentShift: toLocalShift(shift, false), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  openShift: async ({ restaurantId, openingFloatAmount, openingNotes, token }) => {
    set({ loading: true, error: null });
    const clientShiftKey = generateClientShiftKey();
    const online = await checkOnline();

    if (online) {
      try {
        const shift = await openPosShift(
          { restaurantId, openingFloatAmount, openingNotes, clientShiftKey },
          token,
        );
        set({ currentShift: toLocalShift(shift, false), loading: false });
        return { success: true };
      } catch (error: any) {
        if (!isNetworkError(error)) {
          const message = extractErrorMessage(error, 'باز کردن شیفت ناموفق بود');
          set({ loading: false, error: message });
          return { success: false, error: message };
        }
        // خطای شبکهٔ واقعی (نه رد سرور) — به مسیر صف آفلاین زیر ادامه بده
      }
    }

    await queueShiftAction({
      type: 'open',
      clientShiftKey,
      restaurantId,
      payload: { openingFloatAmount, openingNotes },
      serverShiftId: null,
      token,
      baseURL: getApiBaseUrl(),
    });

    const optimisticShift: LocalPosShift = {
      id: null,
      clientShiftKey,
      restaurantId,
      openingFloatAmount,
      openingNotes: openingNotes ?? null,
      status: 'open',
      countedCashAmount: null,
      expectedCashAmount: null,
      varianceAmount: null,
      closingNotes: null,
      openedAt: new Date().toISOString(),
      closedAt: null,
      pendingSync: true,
    };
    set({ currentShift: optimisticShift, loading: false });
    return { success: true };
  },

  closeShift: async ({ countedCashAmount, closingNotes, token }) => {
    const current = get().currentShift;
    if (!current) {
      return { success: false, error: 'شیفت باز فعالی وجود ندارد' };
    }
    set({ loading: true, error: null });
    const online = await checkOnline();

    if (online && current.id != null) {
      try {
        const shift = await closePosShift(
          current.id,
          current.restaurantId,
          { countedCashAmount, closingNotes },
          token,
        );
        const local = toLocalShift(shift, false);
        set({ currentShift: local, loading: false });
        return { success: true, shift: local };
      } catch (error: any) {
        if (!isNetworkError(error)) {
          const message = extractErrorMessage(error, 'بستن شیفت ناموفق بود');
          set({ loading: false, error: message });
          return { success: false, error: message };
        }
        // خطای شبکهٔ واقعی — به مسیر صف آفلاین زیر ادامه بده
      }
    }

    // آفلاین، یا شیفت هنوز sync نشده (id=null) — صف کن، صندوق‌دار را معطل نکن
    await queueShiftAction({
      type: 'close',
      clientShiftKey: current.clientShiftKey,
      restaurantId: current.restaurantId,
      payload: { countedCashAmount, closingNotes },
      serverShiftId: current.id,
      token,
      baseURL: getApiBaseUrl(),
    });

    const localClosed: LocalPosShift = {
      ...current,
      status: 'closed',
      countedCashAmount,
      closingNotes: closingNotes ?? null,
      closedAt: new Date().toISOString(),
      pendingSync: true,
      // مورد انتظار/مغایرت فقط بعد از sync با سرور محاسبه می‌شود — به فروش/مرجوعیِ واقعیِ سرور نیاز دارد
      expectedCashAmount: null,
      varianceAmount: null,
    };
    set({ currentShift: localClosed, loading: false });
    return { success: true, shift: localClosed };
  },

  fetchReport: async (type, token) => {
    const current = get().currentShift;
    if (!current || current.id == null) return null;
    try {
      return await getPosShiftReport(current.id, current.restaurantId, type, token);
    } catch (error) {
      console.error('Failed to fetch pos-shift report:', error);
      return null;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ currentShift: null, loading: false, error: null }),
}));
