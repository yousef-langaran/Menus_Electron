import { create } from 'zustand';

const STORAGE_KEY = 'app-theme';

export type Theme = 'light' | 'dark';

function applyToDocument(theme: Theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function getStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

/** اعمال تم ذخیره‌شده روی document — قبل از اولین رندر صدا بزن (مثلاً در main.tsx) */
export function applyStoredTheme(): void {
  applyToDocument(getStoredTheme());
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme: Theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyToDocument(theme);
    set({ theme });
  },
}));
