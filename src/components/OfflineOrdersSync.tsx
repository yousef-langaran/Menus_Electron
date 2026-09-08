import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { usePosShiftStore } from '../store/posShiftStore';

/**
 * پس از آنلاین شدن (رویداد مرورگر، فوکوس پنجره، یا بازهٔ زمانی)
 * سفارش‌ها، مرجوعی‌ها و اکشن‌های آفلاین شیفت صندوق ذخیره‌شده را به سرور می‌فرستد.
 */
export function OfflineOrdersSync() {
  const token = useAuthStore((s) => s.token);
  const syncingRef = useRef(false);

  const setSyncing = useSyncStore((s) => s.setSyncing);
  const setLastSyncedAt = useSyncStore((s) => s.setLastSyncedAt);
  const setLastError = useSyncStore((s) => s.setLastError);

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
      setSyncing(true);
      const errors: string[] = [];
      try {
        if (window.electronAPI.syncOrders) {
          const ordersResult = await window.electronAPI.syncOrders(liveToken);
          if (ordersResult && (ordersResult.success > 0 || ordersResult.failed > 0)) {
            console.log(`[Offline orders sync:${reason}]`, ordersResult);
          }
          if (ordersResult?.errors?.length) errors.push(...ordersResult.errors);
          if (ordersResult?.success > 0) setLastSyncedAt(new Date().toISOString());
        }

        if (window.electronAPI.syncReturns) {
          const returnsResult = await window.electronAPI.syncReturns(liveToken);
          if (returnsResult && (returnsResult.success > 0 || returnsResult.failed > 0)) {
            console.log(`[Offline returns sync:${reason}]`, returnsResult);
          }
          if (returnsResult?.errors?.length) errors.push(...returnsResult.errors);
          if (returnsResult?.success > 0) setLastSyncedAt(new Date().toISOString());
        }

        if (window.electronAPI.syncPosShifts) {
          const shiftsResult = await window.electronAPI.syncPosShifts(liveToken);
          if (shiftsResult && (shiftsResult.success > 0 || shiftsResult.failed > 0)) {
            console.log(`[Offline pos-shifts sync:${reason}]`, shiftsResult);
          }
          if (shiftsResult?.errors?.length) errors.push(...shiftsResult.errors);
          if (shiftsResult?.success > 0) {
            setLastSyncedAt(new Date().toISOString());
            // پس از موفقیت sync، currentShift را از سرور دوباره بخوان تا pendingSync
            // بدون نیاز به رفرش دستی صفحه در UI پاک شود (همان الگویی که posShiftStore
            // برای شیفتِ در انتظار سرور از قبل پیاده‌سازی کرده — رجوع کنید به loadCurrentShift).
            const pending = usePosShiftStore.getState().currentShift;
            const restaurantId = useAuthStore.getState().user?.restaurants?.[0]?.id;
            if (pending?.pendingSync && restaurantId) {
              void usePosShiftStore.getState().loadCurrentShift(restaurantId, liveToken);
            }
          }
        }

        if (errors.length > 0) {
          setLastError(`همگام‌سازی سفارش/مرجوعی آفلاین: ${errors.length} مورد ناموفق — ${errors[0]}`);
        } else {
          setLastError(null);
        }
      } catch (e: any) {
        console.warn(`[Offline sync:${reason}]`, e);
        setLastError(e?.message || 'همگام‌سازی سفارش‌های آفلاین ناموفق بود');
      } finally {
        setSyncing(false);
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
  }, [token, setSyncing, setLastSyncedAt, setLastError]);

  return null;
}
