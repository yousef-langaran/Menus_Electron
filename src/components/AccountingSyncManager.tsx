import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { getAccountingQueueStats, runAccountingSync } from '../services/accountingSync';
import { scheduleAccountingSync } from '../services/syncCoordinator';
import { canAccessRoute } from '../lib/electronPermissions';

export function AccountingSyncManager() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const restaurantId = user?.restaurants?.[0]?.id;
  const syncingRef = useRef(false);

  const setSyncing = useSyncStore((s) => s.setSyncing);
  const setQueueState = useSyncStore((s) => s.setQueueState);
  const setLastSyncedAt = useSyncStore((s) => s.setLastSyncedAt);
  const setLastError = useSyncStore((s) => s.setLastError);

  useEffect(() => {
    // فقط کاربری که دسترسی ماژول حسابداری دارد باید سینک پس‌زمینه را اجرا کند؛
    // در غیر این صورت هیچ رکوئستی به سرور نرود.
    if (!user || !canAccessRoute(user, '/accounting') || !token || !restaurantId) return;

    const sync = async (reason: string) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const forceFullSync = reason === 'initial' || reason === 'online';
        const result = await runAccountingSync({ restaurantId, token, forceFullSync });
        if (result.syncedAt) setLastSyncedAt(result.syncedAt);
        if (result.pushFailed > 0) {
          setLastError(`همگام‌سازی حسابداری: ${result.pushFailed} عملیات ناموفق — داده‌ها در صف منتظرند`);
        } else {
          setLastError(null);
        }
      } catch (error: any) {
        setLastError(error?.message || 'Accounting sync failed');
      } finally {
        const stats = await getAccountingQueueStats(restaurantId);
        setQueueState(stats.pendingOps, stats.failedOps);
        setSyncing(false);
        syncingRef.current = false;
      }
    };

    const refreshQueue = async () => {
      const stats = await getAccountingQueueStats(restaurantId);
      setQueueState(stats.pendingOps, stats.failedOps);
    };

    void refreshQueue();
    scheduleAccountingSync(() => sync('initial'));

    const onOnline = () => scheduleAccountingSync(() => sync('online'));
    const onFocus = () => scheduleAccountingSync(() => sync('focus'));
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => scheduleAccountingSync(() => sync('interval')), 30_000);
    const queueRefresh = window.setInterval(() => void refreshQueue(), 7_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
      window.clearInterval(queueRefresh);
    };
  }, [
    token,
    user,
    restaurantId,
    setLastError,
    setLastSyncedAt,
    setQueueState,
    setSyncing,
  ]);

  return null;
}
