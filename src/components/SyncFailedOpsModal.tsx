import { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { ModalShell } from '../ui/modal-shell';
import {
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

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalShell size="lg" scrollBehavior="inside">
        <ModalHeader>
          <h2 className="text-base font-semibold">جزئیات عملیات ناموفق همگام‌سازی</h2>
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <p className="text-sm text-default-500 text-center py-6">در حال بارگذاری...</p>
          ) : ops.length === 0 ? (
            <p className="text-sm text-success-600 text-center py-6">هیچ عملیات ناموفقی وجود ندارد.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-default-500 mb-1">
                {ops.length} عملیات ناموفق — با اتصال به اینترنت و کلیک «تلاش مجدد» ارسال می‌شوند.
              </p>
              <div className="rounded-lg border border-default-200 overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-default-100 text-default-600 text-xs">
                    <tr>
                      <th className="px-3 py-2 font-medium">نوع موجودیت</th>
                      <th className="px-3 py-2 font-medium">عملیات</th>
                      <th className="px-3 py-2 font-medium">تعداد تلاش</th>
                      <th className="px-3 py-2 font-medium">پیام خطا</th>
                      <th className="px-3 py-2 font-medium">آخرین تلاش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op, idx) => (
                      <tr
                        key={op.id ?? idx}
                        className="border-t border-default-100 hover:bg-default-50"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {ENTITY_LABELS[op.entityType] ?? op.entityType}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={
                              op.operationType === 'delete'
                                ? 'text-danger-600'
                                : op.operationType === 'create'
                                  ? 'text-success-600'
                                  : 'text-warning-700'
                            }
                          >
                            {OP_LABELS[op.operationType] ?? op.operationType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">{op.retryCount ?? 0}</td>
                        <td className="px-3 py-2 text-danger-700 max-w-[220px]">
                          <span className="line-clamp-2 text-xs" title={op.errorMessage}>
                            {op.errorMessage || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-default-400 whitespace-nowrap">
                          {op.updatedAt ? toShamsiDateTime(op.updatedAt) : '—'}
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
            <Button
              color="warning"
              isLoading={retrying}
              onPress={handleRetryAll}
            >
              تلاش مجدد برای همه
            </Button>
          )}
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
