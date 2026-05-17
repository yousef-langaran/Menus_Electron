import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { runCatalogSync, getCatalogQueueStats } from '../services/catalogSync';

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

  useEffect(() => {
    if (!token || !restaurantId) return;

    const sync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const result = await runCatalogSync({ restaurantId, restaurantName, token });
        if (
          result.categoriesPushed > 0 ||
          result.categoriesFailed > 0 ||
          result.productsPushed > 0 ||
          result.productsFailed > 0 ||
          result.categoriesPulled > 0 ||
          result.productsPulled > 0
        ) {
          console.log('[CatalogSync]', result);
        }
        if (result.categoriesFailed > 0 || result.productsFailed > 0) {
          const stats = await getCatalogQueueStats(restaurantId);
          if (stats.failedCount > 0) {
            console.warn('[CatalogSync] آیتم‌های ناموفق در صف:', stats);
          }
        }
      } catch (e) {
        console.warn('[CatalogSync] خطا:', e);
      } finally {
        syncingRef.current = false;
      }
    };

    void sync();

    const onOnline = () => void sync();
    const onFocus = () => void sync();
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void sync(), 60_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [token, restaurantId, restaurantName]);

  return null;
}
