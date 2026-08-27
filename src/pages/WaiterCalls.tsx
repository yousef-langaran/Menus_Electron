/**
 * کارتابل فراخوان گارسون (پیجر نرم‌افزاری) روی پنل دسکتاپ.
 *
 * درخواست‌های مشتری سر میز از رویدادهای `waiter-calls:*` روی همان سوکت
 * سفارش‌ها می‌رسد (`OrdersSocketManager` آن‌ها را به‌صورت رویداد DOM پخش
 * می‌کند)، پس این صفحه اتصال سوکت جداگانه‌ای باز نمی‌کند و با ورود/خروج از
 * صفحه چیزی قطع نمی‌شود.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Chip } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { useAuthStore } from '../store/authStore';
import { toast } from '../utils/toast';
import { toShamsiTime } from '../utils/date';
import {
  WAITER_CALL_STATUS_LABELS,
  WAITER_CALL_TYPE_LABELS,
  WaiterCallRow,
  WaiterCallStatus,
  acceptWaiterCall,
  cancelWaiterCall,
  completeWaiterCall,
  listActiveWaiterCalls,
  listWaiterCallHistory,
} from '../services/api';

const STATUS_COLORS: Record<WaiterCallStatus, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  accepted: 'success',
  done: 'default',
  cancelled: 'danger',
  expired: 'danger',
};

const isOpen = (status: WaiterCallStatus) => status === 'pending' || status === 'accepted';

const minutesSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

export default function WaiterCallsPage() {
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id;

  const [active, setActive] = useState<WaiterCallRow[]>([]);
  const [history, setHistory] = useState<WaiterCallRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    if (!restaurantId || !token) return;
    setIsLoading(true);
    try {
      const [activeRows, historyRows] = await Promise.all([
        listActiveWaiterCalls(restaurantId, token),
        listWaiterCallHistory(restaurantId, token, 30),
      ]);
      setActive(activeRows);
      setHistory(historyRows);
    } catch {
      toast.error('خطا در بارگذاری فراخوان‌ها');
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // شمارندهٔ «چند دقیقه در انتظار» بدون درخواست شبکه تازه می‌شود
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const mergeCall = useCallback((incoming: WaiterCallRow) => {
    setActive((prev) => {
      const without = prev.filter((c) => c.id !== incoming.id);
      if (!isOpen(incoming.status)) return without;
      return [...without, incoming].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    setHistory((prev) => [incoming, ...prev.filter((c) => c.id !== incoming.id)].slice(0, 30));
  }, []);

  useEffect(() => {
    const onNew = (event: Event) => mergeCall((event as CustomEvent).detail as WaiterCallRow);
    const onUpdated = (event: Event) => mergeCall((event as CustomEvent).detail as WaiterCallRow);

    window.addEventListener('waiter-calls:new', onNew);
    window.addEventListener('waiter-calls:updated', onUpdated);
    return () => {
      window.removeEventListener('waiter-calls:new', onNew);
      window.removeEventListener('waiter-calls:updated', onUpdated);
    };
  }, [mergeCall]);

  const runAction = useCallback(
    async (callId: number, action: 'accept' | 'complete' | 'cancel') => {
      if (!restaurantId || !token) return;
      setBusyId(callId);
      try {
        const updated =
          action === 'accept'
            ? await acceptWaiterCall(callId, restaurantId, token)
            : action === 'complete'
              ? await completeWaiterCall(callId, restaurantId, token)
              : await cancelWaiterCall(callId, restaurantId, token);
        mergeCall(updated);
        toast.success(
          action === 'accept'
            ? 'درخواست را قبول کردید'
            : action === 'complete'
              ? 'درخواست انجام شد'
              : 'درخواست لغو شد',
        );
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'انجام عملیات ناموفق بود');
        void load();
      } finally {
        setBusyId(null);
      }
    },
    [restaurantId, token, mergeCall, load],
  );

  const pendingCount = useMemo(
    () => active.filter((c) => c.status === 'pending').length,
    [active],
  );

  return (
    <div className="min-h-screen bg-default-100 p-4 space-y-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">فراخوان گارسون</h1>
            <p className="text-xs text-default-500">
              درخواست‌های مشتری از روی QR میز — بدون دستگاه پیجر
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Chip size="sm" color="warning" variant="soft">
                {pendingCount.toLocaleString('fa-IR')} در انتظار
              </Chip>
            )}
            <Button variant="flat" size="sm" onPress={() => void load()}>
              تازه‌سازی
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-default-500">
              در حال بارگذاری…
            </CardContent>
          </Card>
        ) : active.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-default-500">
              در حال حاضر درخواست بازی وجود ندارد.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {active.map((call) => {
              const waiting = minutesSince(call.createdAt);
              const urgent = call.status === 'pending' && waiting >= 5;
              return (
                <Card key={call.id} className={urgent ? 'border border-danger-400' : undefined}>
                  <CardContent className="gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-lg">میز {call.tableName}</p>
                        <p className="text-xs text-default-500">
                          {call.typeLabel || WAITER_CALL_TYPE_LABELS[call.type]}
                        </p>
                      </div>
                      <Chip size="sm" color={STATUS_COLORS[call.status]} variant="soft">
                        {WAITER_CALL_STATUS_LABELS[call.status]}
                      </Chip>
                    </div>

                    {call.note ? (
                      <p className="text-sm bg-default-200 rounded-lg px-3 py-2">{call.note}</p>
                    ) : null}

                    <div className="flex items-center justify-between text-xs text-default-500">
                      <span>ثبت: {toShamsiTime(call.createdAt)}</span>
                      <span className={urgent ? 'text-danger font-medium' : undefined}>
                        {waiting.toLocaleString('fa-IR')} دقیقه در انتظار
                      </span>
                    </div>

                    {call.status === 'accepted' && call.acceptedByName ? (
                      <p className="text-xs text-success">پذیرفته توسط {call.acceptedByName}</p>
                    ) : null}

                    <div className="flex gap-2">
                      {call.status === 'pending' && (
                        <Button
                          color="primary"
                          className="flex-1"
                          isDisabled={busyId === call.id}
                          onPress={() => void runAction(call.id, 'accept')}
                        >
                          قبول می‌کنم
                        </Button>
                      )}
                      <Button
                        variant="flat"
                        className="flex-1"
                        isDisabled={busyId === call.id}
                        onPress={() => void runAction(call.id, 'complete')}
                      >
                        انجام شد
                      </Button>
                      <Button
                        variant="light"
                        isDisabled={busyId === call.id}
                        onPress={() => void runAction(call.id, 'cancel')}
                      >
                        لغو
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* تاریخچهٔ کوتاه امروز */}
        {history.length > 0 && (
          <Card>
            <CardContent className="gap-0 p-0">
              <p className="px-4 py-3 text-sm font-semibold border-b border-default-200">
                آخرین فراخوان‌ها
              </p>
              {history.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-3 px-4 py-2 border-b border-default-100 text-sm flex-wrap"
                >
                  <span className="font-medium">میز {call.tableName}</span>
                  <span className="text-default-500">
                    {call.typeLabel || WAITER_CALL_TYPE_LABELS[call.type]}
                  </span>
                  <Chip size="sm" color={STATUS_COLORS[call.status]} variant="soft">
                    {WAITER_CALL_STATUS_LABELS[call.status]}
                  </Chip>
                  {call.acceptedByName ? (
                    <span className="text-xs text-default-500">{call.acceptedByName}</span>
                  ) : null}
                  <span className="text-xs text-default-400 ms-auto">
                    {toShamsiTime(call.createdAt)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
