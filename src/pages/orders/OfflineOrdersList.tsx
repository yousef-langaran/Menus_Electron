import { Card, CardContent } from '@heroui/react';
import { Chip } from '@/ui/compat-chip';
import { Button } from '../../ui/compat-button';
import { formatPrice, formatDate } from './shared';

export interface OfflineOrdersListProps {
  offlineLoading: boolean;
  offlineOrders: any[];
  receiptNumbersMap: Record<string, number>;
  handlePreviewOrder: (order: any, isOffline?: boolean) => void;
  openReprintModal: (order: any, isOffline?: boolean) => void;
  canPrint: boolean;
}

export function OfflineOrdersList({
  offlineLoading,
  offlineOrders,
  receiptNumbersMap,
  handlePreviewOrder,
  openReprintModal,
  canPrint,
}: OfflineOrdersListProps) {
  if (offlineLoading) {
    return <div className="py-12 text-center text-muted">در حال بارگذاری سفارشات آفلاین...</div>;
  }
  if (!offlineOrders.length) {
    return <div className="py-12 text-center text-muted">سفارشی در حافظه آفلاین وجود ندارد.</div>;
  }
  return (
    <div className="flex flex-col gap-4">
      {offlineOrders.map((order: any) => (
        <Card key={order.id} className="shadow-sm border border-border bg-warning-soft/30">
          <CardContent className="gap-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-semibold text-foreground">سفارش آفلاین #{order.id}</h3>
              <Chip size="sm" color="warning" variant="soft">
                در انتظار ارسال
              </Chip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
              <div>
                <strong>شماره رسید فراخوانی:</strong>{' '}
                {receiptNumbersMap[`offline-${order.id}`] ?? '—'}
              </div>
              <div>مشتری: {order.orderData?.customerPhone || '---'}</div>
              <div>
                نوع: {order.orderData?.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}
              </div>
              <div>مبلغ کل: {formatPrice(order.orderData?.totalAmount)}</div>
              {Number(order.orderData?.vatAmount ?? 0) > 0 && (
                <div>ارزش افزوده: {formatPrice(Number(order.orderData.vatAmount))}</div>
              )}
              <div>مبلغ نهایی: {formatPrice(order.orderData?.finalAmount)}</div>
              <div>تاریخ ثبت: {formatDate(order.createdAt)}</div>
            </div>
            {order.orderData?.notes && (
              <p className="text-muted text-sm">
                <strong>یادداشت:</strong> {order.orderData.notes}
              </p>
            )}
            {order.orderData?.items?.length > 0 && (
              <ul className="list-disc list-inside text-sm text-foreground">
                {order.orderData.items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {item.product?.name_fa || item.productName || 'محصول'} - {item.quantity} ×{' '}
                    {formatPrice(item.price)}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="flat" onPress={() => handlePreviewOrder(order, true)}>
                پیش‌نمایش رسید
              </Button>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                onPress={() => openReprintModal(order, true)}
                isDisabled={!canPrint}
              >
                چاپ مجدد
              </Button>
              <span className="text-muted text-sm">این سفارش به محض اتصال ارسال می‌شود.</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
