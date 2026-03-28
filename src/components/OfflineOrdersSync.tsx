import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * پس از آنلاین شدن (رویداد مرورگر، فوکوس پنجره، یا بازهٔ زمانی) سفارش‌های آفلاین ذخیره‌شده را به سرور می‌فرستد.
 */
export function OfflineOrdersSync() {
  const token = useAuthStore((s) => s.token);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!token || !window.electronAPI?.syncOrders || !window.electronAPI?.checkOnline) {
      return;
    }

    const sync = async (reason: string) => {
      if (syncingRef.current) return;
      let online = false;
      try {
        online = await window.electronAPI.checkOnline();
      } catch {
        return;
      }
      if (!online) return;

      syncingRef.current = true;
      try {
        const result = await window.electronAPI.syncOrders(token);
        if (result && (result.success > 0 || result.failed > 0)) {
          console.log(`[Offline orders sync:${reason}]`, result);
        }
      } catch (e) {
        console.warn(`[Offline orders sync:${reason}]`, e);
      } finally {
        syncingRef.current = false;
      }
    };

    const onOnline = () => void sync('online');
    const onFocus = () => void sync('focus');

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    const interval = window.setInterval(() => void sync('interval'), 45_000);

    void sync('initial');

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [token]);

  return null;
}
