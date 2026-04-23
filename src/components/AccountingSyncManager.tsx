import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { getAccountingQueueStats, runAccountingSync } from '../services/accountingSync';

export function AccountingSyncManager() {
  const token = useAuthStore((s) => s.token);
  const restaurantId = useAuthStore((s) => s.user?.restaurants?.[0]?.id);
  const syncingRef = useRef(false);

  const setOnline = useSyncStore((s) => s.setOnline);
  const setSyncing = useSyncStore((s) => s.setSyncing);
  const setQueueState = useSyncStore((s) => s.setQueueState);
  const setLastSyncedAt = useSyncStore((s) => s.setLastSyncedAt);
  const setLastError = useSyncStore((s) => s.setLastError);

  useEffect(() => {
    if (!token || !restaurantId) return;

    const sync = async (reason: string) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const result = await runAccountingSync({ restaurantId, token });
        setOnline(result.isOnline);
        if (result.syncedAt) setLastSyncedAt(result.syncedAt);
        setLastError(null);
        if (result.pushed > 0 || result.pushFailed > 0 || result.pulled > 0) {
          console.log(`[Accounting sync:${reason}]`, result);
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
    void sync('initial');

    const onOnline = () => void sync('online');
    const onFocus = () => void sync('focus');
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void sync('interval'), 30_000);
    const queueRefresh = window.setInterval(() => void refreshQueue(), 7_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
      window.clearInterval(queueRefresh);
    };
  }, [
    token,
    restaurantId,
    setLastError,
    setLastSyncedAt,
    setOnline,
    setQueueState,
    setSyncing,
  ]);

  return null;
}
