import { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
import { createOrderReturn } from '../services/api';

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
    Array<{ productId: number; quantity: number; unitPrice: number; maxQuantity: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && order?.items) {
      // Initialize with all items at quantity 0
      setSelectedItems(
        order.items.map((item: any) => ({
          productId: item.product.id,
          quantity: 0,
          unitPrice: item.price,
          maxQuantity: item.quantity,
        })),
      );
    }
  }, [isOpen, order]);

  const handleQuantityChange = (productId: number, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(Math.max(0, quantity), item.maxQuantity) }
          : item,
      ),
    );
  };

  const handleSubmit = async () => {
    const itemsToReturn = selectedItems.filter((item) => item.quantity > 0);

    if (itemsToReturn.length === 0) {
      setError('لطفاً حداقل یک آیتم برای مرجوعی انتخاب کنید');
      return;
    }

    setLoading(true);
    setError('');

    try {
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

      await createOrderReturn(returnData, token);
      onSuccess();
      onClose();
      resetForm();
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
  };

  const totalReturnAmount = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl">
      <ModalHeader>ایجاد مرجوعی برای سفارش {order?.orderNumber}</ModalHeader>
      <ModalBody>
        <div className="space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">دلیل مرجوعی</label>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full">
              {RETURN_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">آیتم‌های مرجوعی</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {order?.items?.map((orderItem: any, idx: number) => {
                const selectedItem = selectedItems.find(
                  (si) => si.productId === orderItem.product.id,
                );
                return (
                  <div key={idx} className="border rounded p-3 flex justify-between items-center">
                    <div className="flex-1">
                      <p className="font-medium">{orderItem.product.name}</p>
                      <p className="text-sm text-gray-600">
                        قیمت: {new Intl.NumberFormat('fa-IR').format(orderItem.price)} تومان
                      </p>
                      <p className="text-sm text-gray-600">
                        تعداد در سفارش: {orderItem.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm">تعداد مرجوعی:</label>
                      <input
                        type="number"
                        min="0"
                        max={orderItem.quantity}
                        value={selectedItem?.quantity || 0}
                        onChange={(e) =>
                          handleQuantityChange(orderItem.product.id, parseInt(e.target.value) || 0)
                        }
                        className="w-20 px-2 py-1 border rounded"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">یادداشت (اختیاری)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
              placeholder="توضیحات اضافی..."
            />
          </div>

          <div className="bg-gray-100 p-3 rounded">
            <p className="font-semibold">
              مبلغ کل مرجوعی: {new Intl.NumberFormat('fa-IR').format(totalReturnAmount)} تومان
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={loading} color="primary">
            {loading ? 'در حال ثبت...' : 'ثبت مرجوعی'}
          </Button>
          <Button onClick={onClose} variant="outline" disabled={loading}>
            انصراف
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
