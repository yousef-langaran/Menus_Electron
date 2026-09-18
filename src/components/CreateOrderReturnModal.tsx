import { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
import { ModalShell } from '../ui/modal-shell';
import { createOrderReturn, fetchOrderReturns } from '../services/api';

interface CreateOrderReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  restaurantName: string;
  token: string;
  onSuccess: () => void;
}

const RETURN_REASONS = [
  { value: 'customer_request', label: 'درخواست مشتری' },
  { value: 'wrong_order', label: 'سفارش اشتباه' },
  { value: 'quality_issue', label: 'مشکل کیفیت' },
  { value: 'damaged', label: 'آسیب دیده' },
  { value: 'other', label: 'سایر' },
];

export default function CreateOrderReturnModal({
  isOpen,
  onClose,
  order,
  restaurantName,
  token,
  onSuccess,
}: CreateOrderReturnModalProps) {
  const [reason, setReason] = useState('customer_request');
  const [notes, setNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<
    Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
      orderedQuantity: number;
      returnedQuantity: number;
      remainingQuantity: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!isOpen || !order?.items || !token || !restaurantName) {
      return;
    }

    let cancelled = false;

    const loadReturnableItems = async () => {
      setInitializing(true);
      setError('');

      let online = true;
      if (window.electronAPI?.checkOnline) {
        try {
          online = await window.electronAPI.checkOnline();
        } catch {
          online = false;
        }
      }

      if (!cancelled) setIsOffline(!online);

      if (!online) {
        const nextItems = order.items.map((item: any) => ({
          productId: item?.product?.id,
          quantity: 0,
          unitPrice: Number(item?.price || 0),
          orderedQuantity: Number(item?.quantity || 0),
          returnedQuantity: 0,
          remainingQuantity: Number(item?.quantity || 0),
        }));
        if (!cancelled) {
          setSelectedItems(nextItems);
          setInitializing(false);
        }
        return;
      }

      try {
        const response = await fetchOrderReturns(
          {
            restaurantName,
            orderId: order.id,
            limit: 100,
          },
          token,
        );

        const returnedByProduct = new Map<number, number>();
        for (const orderReturn of response?.data || []) {
          if (orderReturn?.status === 'rejected') continue;
          for (const returnItem of orderReturn?.items || []) {
            const productId = returnItem?.product?.id;
            if (!productId) continue;
            const currentValue = returnedByProduct.get(productId) || 0;
            returnedByProduct.set(productId, currentValue + Number(returnItem.quantity || 0));
          }
        }

        const nextItems = order.items.map((item: any) => {
          const productId = item?.product?.id;
          const orderedQuantity = Number(item?.quantity || 0);
          const returnedQuantity = Number(returnedByProduct.get(productId) || 0);
          const remainingQuantity = Math.max(0, orderedQuantity - returnedQuantity);

          return {
            productId,
            quantity: 0,
            unitPrice: Number(item?.price || 0),
            orderedQuantity,
            returnedQuantity,
            remainingQuantity,
          };
        });

        if (!cancelled) {
          setSelectedItems(nextItems);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading existing returns:', err);
          setError(err.response?.data?.message || 'خطا در خواندن وضعیت مرجوعی سفارش');
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    void loadReturnableItems();

    return () => {
      cancelled = true;
    };
  }, [isOpen, order, token, restaurantName]);

  const handleQuantityChange = (productId: number, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: Math.min(Math.max(0, quantity), item.remainingQuantity),
            }
          : item,
      ),
    );
  };

  const handleSubmit = async () => {
    const itemsToReturn = selectedItems.filter(
      (item) => item.quantity > 0 && item.remainingQuantity > 0,
    );

    if (itemsToReturn.length === 0) {
      setError('لطفاً حداقل یک آیتم برای مرجوعی انتخاب کنید');
      return;
    }

    setLoading(true);
    setError('');

    const returnData = {
      orderId: order.id,
      restaurantName,
      reason,
      notes: notes.trim() || undefined,
      items: itemsToReturn.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };

    let online = !isOffline;
    if (window.electronAPI?.checkOnline) {
      try {
        online = await window.electronAPI.checkOnline();
      } catch {
        online = false;
      }
    }

    try {
      if (!online && window.electronAPI?.saveOfflineReturn) {
        const apiConfig = await window.electronAPI.getApiConfig();
        await window.electronAPI.saveOfflineReturn(returnData, token, apiConfig?.baseURL);
        onSuccess();
        onClose();
        resetForm();
      } else {
        await createOrderReturn(returnData, token);
        onSuccess();
        onClose();
        resetForm();
      }
    } catch (err: any) {
      console.error('Error creating return:', err);
      setError(err.response?.data?.message || 'خطا در ایجاد مرجوعی');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setReason('customer_request');
    setNotes('');
    setSelectedItems([]);
    setError('');
    setIsOffline(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const totalReturnAmount = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <ModalShell size="lg">
      <ModalHeader className="border-b border-border pb-3">
        <div className="flex w-full items-center justify-between gap-3" dir="rtl">
          <div className="flex flex-col">
            <span className="text-lg font-bold text-foreground">ثبت مرجوعی</span>
            <span className="text-sm text-muted">
              سفارش #{order?.orderNumber || order?.id}
            </span>
          </div>
          <div className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-soft-foreground">
            مرجوعی جزئی
          </div>
        </div>
      </ModalHeader>
      <ModalBody className="py-4">
        <div className="space-y-4" dir="rtl">
          {isOffline && (
            <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-warning-soft-foreground">
              حالت آفلاین — مرجوعی ذخیره می‌شود و پس از اتصال به اینترنت به‌صورت خودکار ارسال می‌شود. تعداد قابل مرجوع ممکن است دقیق نباشد.
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-danger-soft-foreground">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-default-soft p-4">
            <label className="mb-2 block text-sm font-medium text-foreground">دلیل مرجوعی</label>
            <Select
              selectedKeys={[reason]}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                if (typeof value === 'string') {
                  setReason(value);
                }
              }}
              className="w-full"
            >
              {RETURN_REASONS.map((r) => (
                <SelectItem key={r.value} textValue={r.label}>
                  {r.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-foreground">آیتم‌های مرجوعی</label>
              <span className="text-xs text-muted">فقط تعداد قابل مرجوع فعال است</span>
            </div>
            {initializing ? (
              <div className="py-6 text-center text-gray-500">در حال بررسی اقلام قابل مرجوعی...</div>
            ) : (
            <div className="max-h-[360px] space-y-3 overflow-y-auto pl-1">
              {order?.items?.map((orderItem: any, idx: number) => {
                const selectedItem = selectedItems.find(
                  (si) => si.productId === orderItem.product.id,
                );
                const remainingQuantity = selectedItem?.remainingQuantity || 0;
                const returnedQuantity = selectedItem?.returnedQuantity || 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-default-soft p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {orderItem.product.name_fa || orderItem.product.name}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        قیمت: {new Intl.NumberFormat('fa-IR').format(orderItem.price)} ریال
                      </p>
                      <p className="text-sm text-gray-600">
                        تعداد در سفارش: {orderItem.quantity}
                      </p>
                      <p className="text-sm text-gray-600">
                        مرجوع‌شده: {returnedQuantity} | قابل مرجوع: {remainingQuantity}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <label className="text-xs font-medium text-foreground/70">تعداد مرجوعی</label>
                      <input
                        type="number"
                        min="0"
                        max={remainingQuantity}
                        value={selectedItem?.quantity || 0}
                        onChange={(e) =>
                          handleQuantityChange(orderItem.product.id, parseInt(e.target.value) || 0)
                        }
                        disabled={remainingQuantity <= 0}
                        className="w-24 rounded-xl border border-border-secondary bg-white px-3 py-2 text-center outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:bg-default-soft"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-default-soft p-4">
            <label className="mb-2 block text-sm font-medium text-foreground">یادداشت (اختیاری)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-2xl border border-border-secondary bg-white px-3 py-3 outline-none transition focus:border-accent"
              rows={3}
              placeholder="توضیحات اضافی..."
            />
          </div>

          <div className="rounded-2xl border border-success/30 bg-success-soft p-4">
            <p className="text-sm text-success-soft-foreground">جمع مرجوعی انتخاب‌شده</p>
            <p className="mt-1 text-lg font-bold text-success-soft-foreground">
              مبلغ کل مرجوعی: {new Intl.NumberFormat('fa-IR').format(totalReturnAmount)} ریال
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter className="border-t border-border pt-3">
        <div className="flex w-full flex-row-reverse gap-2" dir="rtl">
          <Button onClick={handleSubmit} isDisabled={loading || initializing} color="primary">
            {loading ? 'در حال ثبت...' : 'ثبت مرجوعی'}
          </Button>
          <Button onClick={handleClose} variant="outline" isDisabled={loading}>
            انصراف
          </Button>
        </div>
      </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
