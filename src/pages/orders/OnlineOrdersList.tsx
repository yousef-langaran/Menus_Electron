import type { NavigateFunction } from 'react-router-dom';
import type { Dispatch, SetStateAction } from 'react';
import { Card, CardContent } from '@heroui/react';
import { Chip } from '@/ui/compat-chip';
import { Button } from '../../ui/compat-button';
import { Select, SelectItem } from '../../ui/compat-select';
import {
  STATUS_LABELS,
  formatPrice,
  formatDate,
  STATUS_OPTIONS,
  ORDERS_PAGE_SIZE_OPTIONS,
} from './shared';

export interface OnlineOrdersListProps {
  onlineLoading: boolean;
  onlineOrders: any[];
  statusColorMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'>;
  receiptNumbersMap: Record<string, number>;
  setCreditPayOrder: Dispatch<any>;
  setCreditPayAmount: Dispatch<SetStateAction<string>>;
  setCreditPayNotes: Dispatch<SetStateAction<string>>;
  setCreditPayHistory: Dispatch<SetStateAction<any[]>>;
  setCreditPayModalOpen: Dispatch<SetStateAction<boolean>>;
  setListNavIndex: Dispatch<SetStateAction<number>>;
  navigate: NavigateFunction;
  handlePreviewOrder: (order: any, isOffline?: boolean) => void;
  openReprintModal: (order: any, isOffline?: boolean) => void;
  canPrint: boolean;
  canRegisterReturn: boolean;
  openReturnModal: (order: any) => void;
  handleStatusChange: (orderId: number, status: string) => Promise<void>;
  statusUpdateLoading: number | null;
  onlineMeta: {
    page: number;
    limit: number;
    offset: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  pageSize: number;
  setPageSize: Dispatch<SetStateAction<number>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
}

export function OnlineOrdersList({
  onlineLoading,
  onlineOrders,
  statusColorMap,
  receiptNumbersMap,
  setCreditPayOrder,
  setCreditPayAmount,
  setCreditPayNotes,
  setCreditPayHistory,
  setCreditPayModalOpen,
  setListNavIndex,
  navigate,
  handlePreviewOrder,
  openReprintModal,
  canPrint,
  canRegisterReturn,
  openReturnModal,
  handleStatusChange,
  statusUpdateLoading,
  onlineMeta,
  pageSize,
  setPageSize,
  setCurrentPage,
}: OnlineOrdersListProps) {
  if (onlineLoading) {
    return <div className="py-12 text-center text-muted">در حال بارگذاری...</div>;
  }
  if (!onlineOrders.length) {
    return <div className="py-12 text-center text-muted">سفارشی برای نمایش وجود ندارد.</div>;
  }
  return (
    <div className="flex flex-col gap-4">
      {onlineOrders.map((order: any) => (
        <Card key={order.id} className="shadow-sm border border-border">
          <CardContent className="gap-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-semibold text-foreground">
                سفارش #{order.orderNumber || order.id}
              </h3>
              <Chip size="sm" color={statusColorMap[order.status] || 'default'} variant="soft">
                {STATUS_LABELS[order.status] || order.status}
              </Chip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
              <div>
                <strong>شماره رسید فراخوانی:</strong>{' '}
                {order.receiptCallNumber ??
                  receiptNumbersMap[String(order.id)] ??
                  receiptNumbersMap[order.orderNumber] ??
                  '—'}
              </div>
              <div>مشتری: {order.customerName || order.customerPhone || '---'}</div>
              <div>تلفن: {order.customerPhone || '---'}</div>
              <div>نوع: {order.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}</div>
              <div>پرداخت: {order.paymentMethod || '---'}</div>
              <div>مبلغ کل: {formatPrice(order.totalAmount)}</div>
              <div>تخفیف: {formatPrice(order.discountAmount)}</div>
              {Number(order.vatAmount ?? 0) > 0 && (
                <div>ارزش افزوده: {formatPrice(Number(order.vatAmount))}</div>
              )}
              <div>مبلغ نهایی: {formatPrice(order.finalAmount)}</div>
              <div>تاریخ: {formatDate(order.createdAt)}</div>
            </div>
            {order.paymentMethod === 'credit' && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-warning font-medium">
                  نسیه: مانده{' '}
                  {Number(
                    Math.max(
                      0,
                      (order.finalAmount ?? order.totalAmount ?? 0) - (order.creditPaidAmount ?? 0),
                    ),
                  ).toLocaleString('fa-IR')}{' '}
                  ریال
                </span>
                {(order.finalAmount ?? order.totalAmount ?? 0) - (order.creditPaidAmount ?? 0) >
                  0 && (
                  <Button
                    size="sm"
                    color="success"
                    variant="flat"
                    onPress={() => {
                      setCreditPayOrder(order);
                      const remaining =
                        (order.finalAmount ?? order.totalAmount ?? 0) -
                        (order.creditPaidAmount ?? 0);
                      setCreditPayAmount(String(remaining));
                      setCreditPayNotes('');
                      setCreditPayHistory([]);
                      setCreditPayModalOpen(true);
                    }}
                  >
                    دریافت پرداخت
                  </Button>
                )}
              </div>
            )}
            {order.notes && (
              <p className="text-muted text-sm">
                <strong>یادداشت:</strong> {order.notes}
              </p>
            )}
            {order.items?.length > 0 && (
              <ul className="list-disc list-inside text-sm text-foreground">
                {order.items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {item.product?.name_fa || item.productName || 'محصول'} - {item.quantity} ×{' '}
                    {formatPrice(item.price)}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button
                size="sm"
                variant="flat"
                color="secondary"
                onPress={() => {
                  const idx = onlineOrders.findIndex((o: any) => o.id === order.id);
                  if (idx >= 0) setListNavIndex(idx);
                  navigate(`/order?edit=${order.id}`);
                }}
              >
                ویرایش فاکتور
              </Button>
              <Button size="sm" variant="flat" onPress={() => handlePreviewOrder(order)}>
                پیش‌نمایش رسید
              </Button>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                onPress={() => openReprintModal(order)}
                isDisabled={!canPrint}
              >
                چاپ مجدد
              </Button>
              {canRegisterReturn && (
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  onPress={() => openReturnModal(order)}
                >
                  ثبت مرجوعی
                </Button>
              )}
              <Select
                size="sm"
                className="max-w-40"
                selectedKeys={[order.status]}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0];
                  if (v) handleStatusChange(order.id, v as string);
                }}
                isDisabled={statusUpdateLoading === order.id}
                variant="bordered"
                label="وضعیت"
              >
                {STATUS_OPTIONS.filter((opt) => opt.value !== 'all').map((option) => (
                  <SelectItem key={option.value} textValue={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>
      ))}
      {onlineMeta.total > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted text-center sm:text-right">
            نمایش {onlineMeta.offset + 1} تا{' '}
            {Math.min(onlineMeta.offset + onlineMeta.limit, onlineMeta.total)} از {onlineMeta.total}{' '}
            سفارش
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              size="sm"
              className="min-w-36"
              selectedKeys={[String(pageSize)]}
              onSelectionChange={(keys) => {
                const value = Number(Array.from(keys)[0]);
                if (!Number.isNaN(value)) {
                  setPageSize(value);
                  setCurrentPage(1);
                }
              }}
              variant="bordered"
              label="تعداد در صفحه"
            >
              {ORDERS_PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={String(size)} textValue={`${size} در صفحه`}>
                  {size} در صفحه
                </SelectItem>
              ))}
            </Select>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="flat"
                isDisabled={!onlineMeta.hasPreviousPage || onlineLoading}
                onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                قبلی
              </Button>
              <span className="text-sm text-muted whitespace-nowrap">
                {onlineMeta.page} / {onlineMeta.totalPages}
              </span>
              <Button
                variant="flat"
                color="primary"
                isDisabled={!onlineMeta.hasNextPage || onlineLoading}
                onPress={() => setCurrentPage((prev) => prev + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
