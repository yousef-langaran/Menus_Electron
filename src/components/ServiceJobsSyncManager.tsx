import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { runServiceJobsSync } from '../services/serviceJobsSync';
import { getPendingServiceJobsCount } from '../services/serviceJobsLocalDb';
import { canAccessRoute } from '../lib/electronPermissions';

/**
 * پس‌زمینه سینک پرونده‌های خدمت (آفلاین → سرور).
 * هیچ UI نمایش نمی‌دهد — فقط sync را مدیریت می‌کند.
 * فعال‌سازی: mount، آنلاین‌شدن، focus، هر ۶۰ ثانیه.
 */
export function ServiceJobsSyncManager() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const restaurantId = user?.restaurants?.[0]?.id;
  const syncingRef = useRef(false);
  const setLastError = useSyncStore((s) => s.setLastError);

  useEffect(() => {
    // فقط کاربری که دسترسی ماژول پرونده خدمات دارد باید سینک پس‌زمینه را اجرا کند؛
    // در غیر این صورت هیچ رکوئستی به سرور نرود.
    if (!user || !canAccessRoute(user, '/service-jobs') || !token || !restaurantId) return;

    const sync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const result = await runServiceJobsSync({ restaurantId, token });
        if (result.jobsFailed > 0) {
          const stats = await getPendingServiceJobsCount(restaurantId);
          if (stats.failedCount > 0) {
            setLastError(`سینک پرونده‌های خدمت: ${stats.failedCount} پرونده ناموفق`);
          }
        }
      } catch (e: any) {
        setLastError(`خطای سینک پرونده‌های خدمت: ${e?.message || 'خطای ناشناخته'}`);
      } finally {
        syncingRef.current = false;
      }
    };

    sync();

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
  }, [token, user, restaurantId, setLastError]);

  return null;
}
