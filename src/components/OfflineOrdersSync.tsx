import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * پس از آنلاین شدن (رویداد مرورگر، فوکوس پنجره، یا بازهٔ زمانی)
 * سفارش‌ها و مرجوعی‌های آفلاین ذخیره‌شده را به سرور می‌فرستد.
 */
export function OfflineOrdersSync() {
  const token = useAuthStore((s) => s.token);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!window.electronAPI?.checkOnline) {
      return;
    }

    const sync = async (reason: string) => {
      if (syncingRef.current) return;
      const liveToken = useAuthStore.getState().token?.trim();
      if (!liveToken) return;

      let online = false;
      try {
        online = await window.electronAPI.checkOnline();
      } catch {
        return;
      }
      if (!online) return;

      syncingRef.current = true;
      try {
        if (window.electronAPI.syncOrders) {
          const ordersResult = await window.electronAPI.syncOrders(liveToken);
          if (ordersResult && (ordersResult.success > 0 || ordersResult.failed > 0)) {
            console.log(`[Offline orders sync:${reason}]`, ordersResult);
          }
        }

        if (window.electronAPI.syncReturns) {
          const returnsResult = await window.electronAPI.syncReturns(liveToken);
          if (returnsResult && (returnsResult.success > 0 || returnsResult.failed > 0)) {
            console.log(`[Offline returns sync:${reason}]`, returnsResult);
          }
        }
      } catch (e) {
        console.warn(`[Offline sync:${reason}]`, e);
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
