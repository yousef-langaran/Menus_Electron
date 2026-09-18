import { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { ModalShell } from '../ui/modal-shell';
import {
  discardAccountingSyncOp,
  discardFailedAccountingSyncOps,
  getFailedAccountingSyncOps,
  retryFailedAccountingOps,
  type LocalSyncOperation,
} from '../services/accountingLocalDb';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { toShamsiDateTime } from '../utils/date';
import { toast } from '../utils/toast';

const ENTITY_LABELS: Record<string, string> = {
  raw_material: 'مواد اولیه',
  supplier: 'تامین‌کننده',
  final_product: 'محصول نهایی',
  recipe_item: 'دستور پخت',
  cash_bank_account: 'حساب نقدی/بانکی',
  operational_expense: 'هزینه عملیاتی',
  expense_category: 'دسته هزینه',
  raw_material_category: 'دسته مواد اولیه',
  purchase_return: 'مرجوعی خرید',
};

const OP_LABELS: Record<string, string> = {
  create: 'ایجاد',
  update: 'ویرایش',
  delete: 'حذف',
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function SyncFailedOpsModal({ isOpen, onClose }: Props) {
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
  const setQueueState = useSyncStore((s) => s.setQueueState);
  const pendingOps = useSyncStore((s) => s.pendingOps);

  const [ops, setOps] = useState<LocalSyncOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!isOpen || !restaurantId) return;
    setLoading(true);
    getFailedAccountingSyncOps(restaurantId)
      .then(setOps)
      .finally(() => setLoading(false));
  }, [isOpen, restaurantId]);

  const handleRetryAll = async () => {
    if (!restaurantId || !token) return;
    setRetrying(true);
    try {
      const count = await retryFailedAccountingOps(restaurantId);
      setQueueState(pendingOps + count, 0);
      toast.success(`${count} عملیات برای تلاش مجدد در صف قرار گرفت`);
      onClose();
    } catch {
      toast.error('خطا در ریست کردن عملیات ناموفق');
    } finally {
      setRetrying(false);
    }
  };

  const handleDiscardOne = async (opId?: number) => {
    if (opId === undefined) return;
    try {
      await discardAccountingSyncOp(opId);
      const next = ops.filter((op) => op.id !== opId);
      setOps(next);
      // When the last failed op is discarded, clear the banner count.
      if (next.length === 0) setQueueState(pendingOps, 0);
    } catch {
      toast.error('خطا در حذف عملیات');
    }
  };

  const handleDiscardAll = async () => {
    if (!restaurantId || ops.length === 0) return;
    if (!window.confirm('همه عملیات‌های ناموفق برای همیشه حذف شوند؟ این عمل قابل بازگشت نیست.')) {
      return;
    }
    setDiscarding(true);
    try {
      const count = await discardFailedAccountingSyncOps(restaurantId);
      setOps([]);
      setQueueState(pendingOps, 0);
      toast.success(`${count} عملیات ناموفق حذف شد`);
      onClose();
    } catch {
      toast.error('خطا در حذف عملیات‌های ناموفق');
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalShell size="lg" scrollBehavior="inside">
        <ModalHeader>
          <h2 className="text-base font-semibold">جزئیات عملیات ناموفق همگام‌سازی</h2>
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <p className="text-sm text-muted text-center py-6">در حال بارگذاری...</p>
          ) : ops.length === 0 ? (
            <p className="text-sm text-success text-center py-6">هیچ عملیات ناموفقی وجود ندارد.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted mb-1">
                {ops.length} عملیات ناموفق — با اتصال به اینترنت و کلیک «تلاش مجدد» ارسال می‌شوند.
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-default-soft text-foreground/70 text-xs">
                    <tr>
                      <th className="px-3 py-2 font-medium">نوع موجودیت</th>
                      <th className="px-3 py-2 font-medium">عملیات</th>
                      <th className="px-3 py-2 font-medium">تعداد تلاش</th>
                      <th className="px-3 py-2 font-medium">پیام خطا</th>
                      <th className="px-3 py-2 font-medium">آخرین تلاش</th>
                      <th className="px-3 py-2 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op, idx) => (
                      <tr
                        key={op.id ?? idx}
                        className="border-t border-border hover:bg-default-soft"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {ENTITY_LABELS[op.entityType] ?? op.entityType}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={
                              op.operationType === 'delete'
                                ? 'text-danger'
                                : op.operationType === 'create'
                                  ? 'text-success'
                                  : 'text-warning-soft-foreground'
                            }
                          >
                            {OP_LABELS[op.operationType] ?? op.operationType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">{op.retryCount ?? 0}</td>
                        <td className="px-3 py-2 text-danger-soft-foreground max-w-[220px]">
                          <span className="line-clamp-2 text-xs" title={op.errorMessage}>
                            {op.errorMessage || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                          {op.updatedAt ? toShamsiDateTime(op.updatedAt) : '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            color="danger"
                            variant="light"
                            isDisabled={discarding}
                            onPress={() => handleDiscardOne(op.id)}
                          >
                            حذف
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" color="default" onPress={onClose}>
            بستن
          </Button>
          {ops.length > 0 && (
            <>
              <Button
                color="danger"
                variant="flat"
                isLoading={discarding}
                onPress={handleDiscardAll}
              >
                حذف همه عملیات ناموفق
              </Button>
              <Button
                color="warning"
                isLoading={retrying}
                onPress={handleRetryAll}
              >
                تلاش مجدد برای همه
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
