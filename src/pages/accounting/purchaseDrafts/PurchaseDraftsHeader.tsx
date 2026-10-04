import type { NavigateFunction } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { Button } from '../../../ui/compat-button';
import {
  resetAccountingPullTimestamp,
  resetEntitySyncOperationsToPending,
  resetFailedPurchaseDraftsToPending,
} from '../../../services/accountingLocalDb';
import { toast } from '../../../utils/toast';

export interface PurchaseDraftsHeaderProps {
  isSyncing: boolean;
  navigate: NavigateFunction;
  restaurantId: number | undefined;
  reload: () => Promise<void>;
  openCreate: () => void;
}

export function PurchaseDraftsHeader({
  isSyncing,
  navigate,
  restaurantId,
  reload,
  openCreate,
}: PurchaseDraftsHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-foreground">پیش‌نویس‌های خرید</h1>
        {isSyncing && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Spinner size="sm" color="current" />
            همگام‌سازی...
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="flat" size="sm" onPress={() => navigate('/accounting')}>
          بازگشت
        </Button>
        <Button
          color="warning"
          variant="flat"
          size="sm"
          onPress={async () => {
            if (!restaurantId) return;
            // Reset entity operations (supplier, final_product, etc.) that were
            // incorrectly marked 'synced' with sequence-generated ids by the old bug.
            const entityCount = await resetEntitySyncOperationsToPending(restaurantId);
            // Also reset failed invoice drafts.
            const draftCount = await resetFailedPurchaseDraftsToPending(restaurantId);
            // Force a full pull so web-created entities appear in Electron.
            await resetAccountingPullTimestamp(restaurantId);
            await reload();
            window.dispatchEvent(new Event('focus'));
            toast.success(
              `همگام‌سازی مجدد: ${entityCount} موجودیت + ${draftCount} پیش‌نویس — در حال ارسال...`,
            );
          }}
        >
          ارسال مجدد و همگام‌سازی کامل
        </Button>
        <Button color="primary" onPress={openCreate}>
          + ثبت پیش‌نویس
        </Button>
      </div>
    </div>
  );
}
