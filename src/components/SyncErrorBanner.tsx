import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';

/**
 * نوار هشدار — sync failures و انقضای اشتراک را نمایش می‌دهد.
 * در AppShellLayout قرار می‌گیرد تا همه صفحات آن را ببینند.
 */
export function SyncErrorBanner() {
  const lastError = useSyncStore((s) => s.lastError);
  const failedOps = useSyncStore((s) => s.failedOps);
  const setLastError = useSyncStore((s) => s.setLastError);
  const subscriptionExpiresAt = useAuthStore((s) => s.subscriptionExpiresAt);

  // هشدار انقضای اشتراک — اگر کمتر از ۷ روز مانده
  const subscriptionWarning = (() => {
    if (!subscriptionExpiresAt) return null;
    const daysLeft = Math.ceil(
      (new Date(subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft <= 0) return 'اشتراک شما منقضی شده است';
    if (daysLeft <= 7) return `اشتراک شما ${daysLeft} روز دیگر منقضی می‌شود`;
    return null;
  })();

  const syncMessage = lastError || (failedOps > 0 ? `${failedOps} عملیات ناموفق در صف همگام‌سازی` : null);

  if (!syncMessage && !subscriptionWarning) return null;

  return (
    <div className="flex flex-col">
      {subscriptionWarning && (
        <div className="bg-danger-50 border-b border-danger-200 px-4 py-2 text-sm text-danger-800 text-center font-medium">
          ⚠️ {subscriptionWarning}
        </div>
      )}
      {syncMessage && (
        <div className="bg-warning-50 border-b border-warning-200 px-4 py-2 flex items-center justify-between gap-3 text-sm text-warning-800">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{syncMessage}</span>
            <span className="text-warning-600 text-xs">— با اتصال به اینترنت خودکار همگام‌سازی می‌شود</span>
          </div>
          <button
            onClick={() => setLastError(null)}
            className="text-warning-600 hover:text-warning-900 text-lg leading-none"
            aria-label="بستن"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
