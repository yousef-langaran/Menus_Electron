import { create } from 'zustand';

const MUTE_STORAGE_KEY = 'kdsAudioMuted';
const AGING_THRESHOLD_STORAGE_KEY = 'kdsAudioAgingThresholdMinutes';

/** آستانهٔ پیش‌فرض هشدار صوتیِ دیرکرد (دقیقه) — مستقل از رنگ‌بندی کارت (ELAPSED_WARN_MINUTES در Kds.tsx) */
export const DEFAULT_KDS_AGING_THRESHOLD_MINUTES = 15;

interface KdsAudioState {
  /** بی‌صدا کردن هشدارهای صوتی KDS — کاربر تنظیم می‌کند، در localStorage ماندگار است */
  muted: boolean;
  /** بعد از چند دقیقه از ثبت سفارش، یک هشدار صوتیِ دیرکرد پخش شود */
  agingThresholdMinutes: number;
  setMuted: (muted: boolean) => void;
  setAgingThresholdMinutes: (minutes: number) => void;
}

const readMutedFromStorage = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const readAgingThresholdFromStorage = (): number => {
  if (typeof window === 'undefined') return DEFAULT_KDS_AGING_THRESHOLD_MINUTES;
  try {
    const raw = window.localStorage.getItem(AGING_THRESHOLD_STORAGE_KEY);
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KDS_AGING_THRESHOLD_MINUTES;
  } catch {
    return DEFAULT_KDS_AGING_THRESHOLD_MINUTES;
  }
};

export const useKdsAudioStore = create<KdsAudioState>((set) => ({
  muted: readMutedFromStorage(),
  agingThresholdMinutes: readAgingThresholdFromStorage(),

  setMuted: (muted: boolean) => {
    set({ muted });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
      } catch (error) {
        console.error('Failed to save KDS audio mute setting:', error);
      }
    }
  },

  setAgingThresholdMinutes: (minutes: number) => {
    const clamped = Math.max(1, Math.min(180, Math.round(minutes) || DEFAULT_KDS_AGING_THRESHOLD_MINUTES));
    set({ agingThresholdMinutes: clamped });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AGING_THRESHOLD_STORAGE_KEY, String(clamped));
      } catch (error) {
        console.error('Failed to save KDS aging threshold setting:', error);
      }
    }
  },
}));
