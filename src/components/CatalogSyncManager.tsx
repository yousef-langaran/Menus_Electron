import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { runCatalogSync, getCatalogQueueStats } from '../services/catalogSync';
import { scheduleCatalogSync } from '../services/syncCoordinator';

/**
 * کامپوننت پس‌زمینه برای سینک آفلاین محصولات و دسته‌بندی‌ها.
 * هیچ UI نمایش نمی‌دهد — فقط sync را مدیریت می‌کند.
 * فعال‌سازی: mount، آنلاین‌شدن، focus، هر ۶۰ ثانیه.
 */
export function CatalogSyncManager() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const restaurantId = user?.restaurants?.[0]?.id;
  const restaurantName = user?.restaurants?.[0]?.name;
  const syncingRef = useRef(false);
  const setLastError = useSyncStore((s) => s.setLastError);

  useEffect(() => {
    if (!token || !restaurantId) return;

    const sync = async (forceFullSync = false) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const result = await runCatalogSync({ restaurantId, restaurantName, token, forceFullSync });
        if (result.categoriesFailed > 0 || result.productsFailed > 0) {
          const stats = await getCatalogQueueStats(restaurantId);
          if (stats.failedCount > 0) {
            setLastError(`همگام‌سازی کاتالوگ: ${stats.failedCount} آیتم ناموفق`);
          }
        } else {
          // پاک کردن خطای قبلی catalog اگر موفق بود
          setLastError(null);
        }
      } catch (e: any) {
        setLastError(`خطای همگام‌سازی کاتالوگ: ${e?.message || 'خطای ناشناخته'}`);
      } finally {
        syncingRef.current = false;
      }
    };

    const scheduleSync = (full = false) => scheduleCatalogSync(() => sync(full));

    scheduleSync(true); // initial load = full sync

    const onOnline = () => scheduleSync(true);  // back online = full sync
    const onFocus = () => scheduleSync(false);  // focus = incremental
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => scheduleSync(false), 60_000); // interval = incremental

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [token, restaurantId, restaurantName, setLastError]);

  return null;
}
