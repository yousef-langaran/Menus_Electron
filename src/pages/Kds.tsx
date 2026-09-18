import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { fetchOrders, updateOrderStatus } from '../services/api';
import { connectOrdersSocket, disconnectOrdersSocket } from '../services/ordersSocket';
import { Card, CardContent, Chip } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { toast } from '../utils/toast';
import { useKdsAudioStore } from '../store/kdsAudioStore';
import { playKdsAgingAlertChime, playKdsNewOrderChime } from '../utils/kdsSound';

type KdsOrderItem = {
  id: number;
  quantity: number;
  itemNote?: string | null;
  product?: {
    name?: string;
    name_fa?: string;
    category?: { name?: string; name_fa?: string } | null;
  } | null;
};

type KdsOrderStatus = 'confirmed' | 'preparing' | 'ready';

type KdsOrder = {
  id: number;
  orderNumber: string;
  status: KdsOrderStatus | string;
  serviceType?: string;
  tableNumber?: string | null;
  createdAt: string;
  items?: KdsOrderItem[];
};

const BOARD_STATUSES: KdsOrderStatus[] = ['confirmed', 'preparing', 'ready'];

const COLUMN_LABELS: Record<KdsOrderStatus, string> = {
  confirmed: 'تایید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده تحویل',
};

const ADVANCE_LABELS: Record<string, string> = {
  confirmed: 'شروع آماده‌سازی',
  preparing: 'آماده شد',
};

const NEXT_STATUS: Record<string, string> = {
  confirmed: 'preparing',
  preparing: 'ready',
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  dine_in: 'سالن',
  takeaway: 'بیرون‌بر',
  delivery: 'پیک',
};

// آستانهٔ رنگ نشان زمان‌سنج — فعلاً ثابت سراسری (بدون تنظیم به‌ازای رستوران، رجوع کنید به spec فاز ۱)
const ELAPSED_WARN_MINUTES = 15;
const ELAPSED_DANGER_MINUTES = 30;

function elapsedMinutes(createdAt: string, now: number): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 60000));
}

function elapsedTone(minutes: number): 'success' | 'warning' | 'danger' {
  if (minutes >= ELAPSED_DANGER_MINUTES) return 'danger';
  if (minutes >= ELAPSED_WARN_MINUTES) return 'warning';
  return 'success';
}

function productLabel(item: KdsOrderItem): string {
  return item.product?.name_fa || item.product?.name || 'محصول حذف‌شده';
}

function categoryLabel(item: KdsOrderItem): string | null {
  return item.product?.category?.name_fa || item.product?.category?.name || null;
}

export default function KdsPage() {
  const { user, token } = useAuthStore();
  const restaurantName = useMemo(() => user?.restaurants?.[0]?.name?.trim(), [user]);

  const [orders, setOrders] = useState<Record<number, KdsOrder>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [stationFilter, setStationFilter] = useState<string | null>(null);
  const [busyOrderIds, setBusyOrderIds] = useState<Record<number, boolean>>({});
  // آیتم‌های «بامپ‌شده» (آمادهٔ تحویل) به تفکیک سفارش — کاملاً سمت کلاینت، فقط
  // برای هماهنگی کار در آشپزخانه؛ مستقل از وضعیت کل سفارش که هنوز whole-order است
  const [bumpedItemIds, setBumpedItemIds] = useState<Record<number, Set<number>>>({});
  const { muted: audioMuted, agingThresholdMinutes, setMuted: setAudioMuted, setAgingThresholdMinutes } =
    useKdsAudioStore();
  // شناسهٔ سفارش‌هایی که قبلاً برایشان هشدار دیرکرد پخش شده — تا هر ۱۵ ثانیه دوباره پخش نشود
  const agingAlertedOrderIdsRef = useRef<Set<number>>(new Set());

  const upsertOrder = useCallback((order: KdsOrder) => {
    setOrders((prev) => {
      const next = { ...prev };
      if (BOARD_STATUSES.includes(order.status as KdsOrderStatus)) {
        next[order.id] = order;
      } else {
        delete next[order.id];
      }
      return next;
    });
  }, []);

  const loadAll = useCallback(async () => {
    if (!restaurantName) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        BOARD_STATUSES.map((status) =>
          fetchOrders({ restaurantName, status, limit: 100 }, token || undefined),
        ),
      );
      const merged: Record<number, KdsOrder> = {};
      results.forEach((res) => {
        const data = Array.isArray(res?.data) ? res.data : [];
        data.forEach((order: KdsOrder) => {
          merged[order.id] = order;
        });
      });
      setOrders(merged);
    } catch (error) {
      console.error('[KDS] failed to load orders:', error);
      toast.error('دریافت سفارش‌ها ناموفق بود');
    } finally {
      setLoading(false);
    }
  }, [restaurantName, token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // تیک ساعت برای به‌روزرسانی نشان زمان‌سنج — نیازی به رفرش داده نیست، فقط رندر دوباره
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);

  // مرجع زنده برای mute — تا افکت سوکت به‌خاطر تغییر mute دوباره subscribe نشود
  const audioMutedRef = useRef(audioMuted);
  useEffect(() => {
    audioMutedRef.current = audioMuted;
  }, [audioMuted]);

  // اتصال زندهٔ سوکت — دقیقاً همان رویدادهایی که orders.gateway.ts برای هر تغییر
  // وضعیت/سفارش جدید پخش می‌کند، بدون هیچ endpoint یا event جدید
  useEffect(() => {
    if (!token || !restaurantName) return;

    const socket = connectOrdersSocket({ token, restaurantName });
    if (!socket) return;

    const handleNew = (order: KdsOrder) => {
      if (!audioMutedRef.current) {
        playKdsNewOrderChime();
      }
      upsertOrder(order);
    };
    const handleUpdated = (order: KdsOrder) => upsertOrder(order);

    socket.on('orders:new', handleNew);
    socket.on('orders:updated', handleUpdated);

    return () => {
      socket.off('orders:new', handleNew);
      socket.off('orders:updated', handleUpdated);
      disconnectOrdersSocket();
    };
  }, [token, restaurantName, upsertOrder]);

  const orderList = useMemo(
    () =>
      Object.values(orders).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [orders],
  );

  // هشدار صوتیِ دیرکرد — وقتی سفارشی از آستانهٔ قابل‌تنظیم عبور کند، یک‌بار (نه هر تیک) پخش می‌شود
  useEffect(() => {
    const currentIds = new Set(orderList.map((order) => order.id));
    agingAlertedOrderIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        agingAlertedOrderIdsRef.current.delete(id);
      }
    });
    if (audioMuted) return;
    orderList.forEach((order) => {
      const minutes = elapsedMinutes(order.createdAt, now);
      if (minutes >= agingThresholdMinutes && !agingAlertedOrderIdsRef.current.has(order.id)) {
        agingAlertedOrderIdsRef.current.add(order.id);
        playKdsAgingAlertChime();
      }
    });
  }, [orderList, now, agingThresholdMinutes, audioMuted]);

  const stations = useMemo(() => {
    const names = new Set<string>();
    orderList.forEach((order) => {
      (order.items || []).forEach((item) => {
        const label = categoryLabel(item);
        if (label) names.add(label);
      });
    });
    return Array.from(names).sort();
  }, [orderList]);

  const columns = useMemo(() => {
    const grouped: Record<KdsOrderStatus, KdsOrder[]> = {
      confirmed: [],
      preparing: [],
      ready: [],
    };
    orderList.forEach((order) => {
      if (grouped[order.status as KdsOrderStatus]) {
        grouped[order.status as KdsOrderStatus].push(order);
      }
    });
    return grouped;
  }, [orderList]);

  const toggleItemBump = useCallback((orderId: number, itemId: number) => {
    setBumpedItemIds((prev) => {
      const current = new Set(prev[orderId] ?? []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        current.add(itemId);
      }
      return { ...prev, [orderId]: current };
    });
  }, []);

  const setBusy = useCallback((orderId: number, value: boolean) => {
    setBusyOrderIds((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[orderId];
        return next;
      }
      return { ...prev, [orderId]: true };
    });
  }, []);

  const handleAdvance = useCallback(
    async (order: KdsOrder) => {
      const next = NEXT_STATUS[order.status];
      if (!next || busyOrderIds[order.id]) return;
      setBusy(order.id, true);
      const previous = order;
      // به‌روزرسانی خوش‌بینانه؛ رویداد orders:updated که از همین فراخوانی روی
      // بک‌اند ساطع می‌شود هم به بقیهٔ صفحات (POS، Orders.tsx) می‌رسد
      setOrders((prev) => ({ ...prev, [order.id]: { ...order, status: next } }));
      try {
        await updateOrderStatus(order.id, next, token || undefined);
      } catch (error) {
        console.error('[KDS] failed to advance order:', error);
        toast.error('تغییر وضعیت سفارش ناموفق بود');
        setOrders((prev) => ({ ...prev, [order.id]: previous }));
      } finally {
        setBusy(order.id, false);
      }
    },
    [busyOrderIds, setBusy, token],
  );

  const handleDeliver = useCallback(
    async (order: KdsOrder) => {
      if (busyOrderIds[order.id]) return;
      setBusy(order.id, true);
      setOrders((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      try {
        await updateOrderStatus(order.id, 'delivered', token || undefined);
        setBumpedItemIds((prev) => {
          if (!prev[order.id]) return prev;
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      } catch (error) {
        console.error('[KDS] failed to deliver order:', error);
        toast.error('تحویل سفارش ناموفق بود');
        upsertOrder(order);
      } finally {
        setBusy(order.id, false);
      }
    },
    [busyOrderIds, setBusy, token, upsertOrder],
  );

  if (!restaurantName) {
    return (
      <div className="flex-1 flex items-center justify-center p-8" dir="rtl">
        <p className="text-muted">رستوران متصل یافت نشد.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">نمایشگر آشپزخانه</h1>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="bordered"
              color={audioMuted ? 'default' : 'primary'}
              onPress={() => setAudioMuted(!audioMuted)}
            >
              {audioMuted ? 'صدا خاموش' : 'صدا روشن'}
            </Button>
            <label className="flex items-center gap-1 text-xs text-muted">
              آستانهٔ دیرکرد (دقیقه)
              <input
                type="number"
                min={1}
                max={180}
                value={agingThresholdMinutes}
                onChange={(e) => setAgingThresholdMinutes(Number(e.target.value))}
                className="w-14 rounded border border-border-secondary bg-background px-1 py-0.5 text-center text-xs"
              />
            </label>
          </div>
        </div>
        {stations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              color={stationFilter === null ? 'primary' : 'default'}
              variant={stationFilter === null ? 'solid' : 'bordered'}
              onPress={() => setStationFilter(null)}
            >
              همه
            </Button>
            {stations.map((station) => (
              <Button
                key={station}
                size="sm"
                color={stationFilter === station ? 'primary' : 'default'}
                variant={stationFilter === station ? 'solid' : 'bordered'}
                onPress={() => setStationFilter((prev) => (prev === station ? null : station))}
              >
                {station}
              </Button>
            ))}
          </div>
        )}
      </div>

      {loading && orderList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-sm animate-pulse">در حال بارگذاری...</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-hidden">
          {BOARD_STATUSES.map((status) => (
            <div key={status} className="flex flex-col min-h-0 bg-default-soft rounded-xl border border-border">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">{COLUMN_LABELS[status]}</h2>
                <Chip size="sm" variant="soft">{columns[status].length}</Chip>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
                {columns[status].length === 0 && (
                  <p className="text-muted text-sm text-center py-6">سفارشی نیست</p>
                )}
                {columns[status].map((order) => {
                  const minutes = elapsedMinutes(order.createdAt, now);
                  const tone = elapsedTone(minutes);
                  const busy = !!busyOrderIds[order.id];
                  return (
                    <Card key={order.id} className="border border-border">
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-foreground">#{order.orderNumber}</span>
                          <Chip size="sm" color={tone} variant="soft">
                            {minutes} دقیقه
                          </Chip>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>{SERVICE_TYPE_LABELS[order.serviceType || ''] || order.serviceType}</span>
                          {order.tableNumber && <span>· میز {order.tableNumber}</span>}
                        </div>
                        <div className="flex flex-col gap-1">
                          {(order.items || []).map((item) => {
                            const station = categoryLabel(item);
                            const dimmed = stationFilter !== null && station !== stationFilter;
                            const bumped = bumpedItemIds[order.id]?.has(item.id) ?? false;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleItemBump(order.id, item.id)}
                                title={bumped ? 'لغو علامت آماده' : 'علامت‌گذاری به‌عنوان آماده'}
                                className={`text-sm flex items-baseline gap-1 text-right rounded px-1 -mx-1 hover:bg-default-soft transition-colors ${
                                  dimmed ? 'opacity-35' : ''
                                } ${bumped ? 'line-through text-muted' : ''}`}
                              >
                                <span className="font-semibold text-foreground">{bumped ? '✓' : '○'}</span>
                                <span className="font-semibold text-foreground">{item.quantity}×</span>
                                <span className="text-foreground">{productLabel(item)}</span>
                                {item.itemNote && (
                                  <span className="text-xs text-muted">({item.itemNote})</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          {NEXT_STATUS[order.status] && (
                            <Button
                              size="sm"
                              color="primary"
                              isLoading={busy}
                              onPress={() => handleAdvance(order)}
                              className="flex-1"
                            >
                              {ADVANCE_LABELS[order.status]}
                            </Button>
                          )}
                          {order.status === 'ready' && (
                            <Button
                              size="sm"
                              color="success"
                              variant="bordered"
                              isLoading={busy}
                              onPress={() => handleDeliver(order)}
                              className="flex-1"
                            >
                              تحویل داده شد
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
