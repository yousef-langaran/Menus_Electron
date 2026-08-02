import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// در اجرای واقعی، main.ts سوییچ `lang=fa-IR` را می‌دهد و کرومیوم `fa` گزارش می‌کند.
// React Aria جهت RTL را از همین مقدار می‌گیرد، پس تست‌ها هم باید با همان لوکیل اجرا شوند
// وگرنه کامپوننت‌های HeroUI در تست LTR رندر می‌شوند و با محصول فرق می‌کنند.
Object.defineProperty(navigator, 'language', { value: 'fa', configurable: true });
Object.defineProperty(navigator, 'languages', { value: ['fa', 'en-US'], configurable: true });

// The renderer talks to the main process only through the preload bridge, so a
// single stub here keeps every store test free of Electron itself.
const electronAPI = {
  print: vi.fn(),
  printReceipt: vi.fn(),
  getPreference: vi.fn(),
  setPreference: vi.fn(),
  onOnlineStatus: vi.fn(),
  syncNow: vi.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: electronAPI,
  writable: true,
  configurable: true,
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
