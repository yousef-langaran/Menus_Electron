import { create } from 'zustand';
import { callerLookup, addCustomer, type CallerLookupResult } from '../services/api';

export type { CallerLookupResult };

export interface IncomingCall {
  phone: string;
  timestamp: string;
  lookupResult: CallerLookupResult | null;
  isLoading: boolean;
  error: string | null;
}

const HISTORY_LIMIT = 100;
const HISTORY_KEY = 'menus:caller-history-v1';

function readHistory(): IncomingCall[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeHistory(history: IncomingCall[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('[CallerID] writeHistory error:', err);
  }
}

interface CallerIdState {
  activeCall: IncomingCall | null;
  callHistory: IncomingCall[];
  settings: {
    enabled: boolean;
    webhookPort: number;
    webhookSecret: string;
    phoneField: string;
    notifyDurationSec: number;
    playSoundEnabled: boolean;
  } | null;
  settingsLoaded: boolean;

  handleIncomingCall: (
    phone: string,
    timestamp: string,
    restaurantId: number,
    token: string,
  ) => Promise<void>;
  dismissCall: () => void;
  createNewOrder: (navigate: (path: string, opts?: any) => void) => void;
  addCallerAsCustomer: (
    restaurantId: number,
    token: string,
    firstName?: string,
    lastName?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  loadSettings: () => Promise<void>;
  saveSettings: (partial: Partial<CallerIdState['settings']>) => Promise<void>;
  /** نگه‌داشته شده برای سازگاری — localStorage در init بارگذاری می‌شود */
  loadHistory: () => Promise<void>;
}

export const useCallerIdStore = create<CallerIdState>((set, get) => ({
  activeCall: null,
  callHistory: readHistory(),   // ← بارگذاری فوری از localStorage هنگام ساخت store
  settings: null,
  settingsLoaded: false,

  handleIncomingCall: async (phone, timestamp, restaurantId, token) => {
    const call: IncomingCall = { phone, timestamp, lookupResult: null, isLoading: true, error: null };
    set({ activeCall: call });

    try {
      const result = await callerLookup({ restaurantId, phone }, token);
      set((s) => ({
        activeCall: s.activeCall?.phone === phone
          ? { ...s.activeCall, lookupResult: result, isLoading: false }
          : s.activeCall,
      }));
    } catch (err: any) {
      set((s) => ({
        activeCall: s.activeCall?.phone === phone
          ? { ...s.activeCall, isLoading: false, error: String(err?.message || err) }
          : s.activeCall,
      }));
    }
  },

  dismissCall: () => {
    const { activeCall, callHistory } = get();
    if (!activeCall) return;
    const newHistory = [
      { ...activeCall, isLoading: false },
      ...callHistory,
    ].slice(0, HISTORY_LIMIT);
    set({ activeCall: null, callHistory: newHistory });
    writeHistory(newHistory);   // ← ذخیره synchronous
  },

  createNewOrder: (navigate) => {
    const { activeCall } = get();
    if (!activeCall) return;
    const phone = activeCall.phone;
    const name = activeCall.lookupResult?.customer
      ? `${activeCall.lookupResult.customer.firstName} ${activeCall.lookupResult.customer.lastName}`.trim()
      : '';
    const defaultAddress =
      activeCall.lookupResult?.addresses?.find((a) => a.isDefault)?.address
      ?? activeCall.lookupResult?.addresses?.[0]?.address
      ?? '';
    get().dismissCall();
    navigate('/order', {
      state: { prefill: { customerPhone: phone, customerName: name, customerAddress: defaultAddress } },
    });
  },

  addCallerAsCustomer: async (restaurantId, token, firstName = '', lastName = '') => {
    const { activeCall } = get();
    if (!activeCall) return { success: false, error: 'تماسی فعال نیست' };
    try {
      await addCustomer({ restaurantId }, { mobile: activeCall.phone, firstName, lastName }, token);
      const result = await callerLookup({ restaurantId, phone: activeCall.phone }, token);
      set((s) => ({
        activeCall: s.activeCall?.phone === activeCall.phone
          ? { ...s.activeCall, lookupResult: result }
          : s.activeCall,
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: String(err?.response?.data?.message || err?.message || err) };
    }
  },

  loadSettings: async () => {
    try {
      const api = window.electronAPI;
      if (!api?.getCallerIdSettings) return;
      const s = await api.getCallerIdSettings();
      set({ settings: s, settingsLoaded: true });
    } catch {
      set({ settingsLoaded: true });
    }
  },

  saveSettings: async (partial) => {
    try {
      const api = window.electronAPI;
      if (!api?.saveCallerIdSettings) return;
      const res = await api.saveCallerIdSettings(partial as any);
      if (res?.settings) {
        set({ settings: res.settings });
      }
    } catch (err) {
      console.error('[CallerID] saveSettings error:', err);
    }
  },

  loadHistory: async () => {
    // localStorage در زمان ساخت store بارگذاری شده — این تابع فقط برای سازگاری نگه‌داشته شده
  },
}));
