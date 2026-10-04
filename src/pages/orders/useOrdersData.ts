import type { User } from '../../store/authStore';
import type { Dispatch, SetStateAction } from 'react';
import { useRef, useCallback, useEffect } from 'react';
import { fetchOrders } from '../../services/api';
import { getAllOrders } from '../../services/offlineStorage';
import { disconnectOrdersSocket, connectOrdersSocket } from '../../services/ordersSocket';
import { attachOrdersSocketPanelSidecar } from '../../services/ordersSocketPanelSidecar';
import { toast } from '../../utils/toast';
import { DEFAULT_ONLINE_META } from './shared';

export interface useOrdersDataArgs {
  detectOnlineStatus: () => Promise<any>;
  setIsOnline: Dispatch<SetStateAction<boolean>>;
  isOnline: boolean;
  statusFilter: string;
  currentPage: number;
  pageSize: number;
  restaurantName: any;
  token: string | null;
  setOnlineOrders: Dispatch<SetStateAction<any[]>>;
  setOnlineMeta: Dispatch<
    SetStateAction<{
      page: number;
      limit: number;
      offset: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    }>
  >;
  setOnlineLoading: Dispatch<SetStateAction<boolean>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  loadReceiptNumbersMap: () => Promise<void>;
  setOfflineLoading: Dispatch<SetStateAction<boolean>>;
  setOfflineOrders: Dispatch<SetStateAction<any[]>>;
  user: User | null;
  setCashBankAccounts: Dispatch<
    SetStateAction<{ id: number; name: string; accountType: string }[]>
  >;
  setCreditPayAccountId: Dispatch<SetStateAction<string>>;
}

export function useOrdersData({
  detectOnlineStatus,
  setIsOnline,
  isOnline,
  statusFilter,
  currentPage,
  pageSize,
  restaurantName,
  token,
  setOnlineOrders,
  setOnlineMeta,
  setOnlineLoading,
  setCurrentPage,
  loadReceiptNumbersMap,
  setOfflineLoading,
  setOfflineOrders,
  user,
  setCashBankAccounts,
  setCreditPayAccountId,
}: useOrdersDataArgs) {
  // Debouncer برای جمع‌بست burst رویدادهای سوکت (orders:new/updated پشت‌سرهم)
  // تا به‌جای چندین درخواست fetch پشت‌سرهم، فقط یک رفرش سایلنت انجام شود.
  // شناسهٔ پایدار: همیشه به آخرین loadOnlineOrders از طریق ref اشاره می‌کند،
  // بنابراین socket effect با هر رندر بازتولید نمی‌شود.
  const onlineReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadOnlineOrdersRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => {});
  const scheduleOnlineReload = useCallback(() => {
    if (onlineReloadTimerRef.current) clearTimeout(onlineReloadTimerRef.current);
    onlineReloadTimerRef.current = setTimeout(() => {
      onlineReloadTimerRef.current = null;
      void loadOnlineOrdersRef.current(true);
    }, 800);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {
      await loadOfflineOrders();
      const current = await detectOnlineStatus();
      setIsOnline(current);
      // بارگذاری سفارشات آنلاین فقط از طریق useEffect زیر انجام می‌شود تا دوباره فراخوانی نشود
    };

    initialize();

    if (window.electronAPI?.onOnlineStatusChange) {
      const cleanup = window.electronAPI.onOnlineStatusChange((status) => {
        setIsOnline(status);
        if (!status) {
          // سفارشات قبلاً بارگذاری‌شده را پاک نکن — کاربر همان‌ها را می‌بیند تا اتصال برقرار شود
          toast.info('شما آفلاین هستید. سفارشات جدید در حافظه نگهداری می‌شوند.');
          loadOfflineOrders();
        }
        // وقتی آنلاین شد، useEffect با وابستگی isOnline خودش loadOnlineOrders را یک بار صدا می‌زند
      });
      if (typeof cleanup === 'function') {
        unsubscribe = cleanup;
      }
    } else {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => {
        setIsOnline(false);
        // سفارشات قبلاً بارگذاری‌شده را پاک نکن — کاربر همان‌ها را می‌بیند تا اتصال برقرار شود
        toast.info('شما آفلاین هستید. سفارشات جدید در حافظه نگهداری می‌شوند.');
        loadOfflineOrders();
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      unsubscribe = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  // فقط یک منبع برای بارگذاری سفارشات آنلاین (با تغییر وضعیت آنلاین یا فیلتر)
  useEffect(() => {
    if (isOnline) {
      loadOnlineOrders();
    }
  }, [statusFilter, isOnline, currentPage, pageSize, restaurantName, token]);

  useEffect(() => {
    console.log('[OrdersPage] Socket useEffect triggered', {
      hasToken: !!token,
      restaurantName,
      isOnline,
    });

    if (!token || !restaurantName || !isOnline) {
      console.warn('[OrdersPage] Missing requirements, disconnecting socket');
      disconnectOrdersSocket();
      return;
    }

    const socket = connectOrdersSocket({ token, restaurantName });
    if (!socket) {
      return;
    }

    const detachPanel = attachOrdersSocketPanelSidecar(socket);

    console.log('[OrdersPage] Socket created, setting up listeners');

    const handleNewOrder = (order: any) => {
      toast.success(`سفارش جدید ${order.orderNumber || order.id} ثبت شد.`);
      scheduleOnlineReload();
    };

    const handleOrderUpdated = (_order: any) => {
      scheduleOnlineReload();
    };

    const handleSocketError = (message: any) => {
      const resolvedMessage =
        typeof message === 'string' ? message : 'خطا در ارتباط زنده سفارش‌ها.';
      toast.error(resolvedMessage);
    };

    const handleConnect = () => {
      // اتصال زنده برقرار است؛ پیام جداگانه نشان داده نمی‌شود.
    };

    const handleConnectError = (error: Error) => {
      console.error('Orders socket connection error:', error);
      toast.error('اتصال سوکت سفارش‌ها برقرار نشد.');
    };

    socket.on('connect', handleConnect);
    socket.on('orders:new', handleNewOrder);
    socket.on('orders:updated', handleOrderUpdated);
    socket.on('orders:error', handleSocketError);
    socket.on('connect_error', handleConnectError);

    return () => {
      detachPanel();
      socket.off('connect', handleConnect);
      socket.off('orders:new', handleNewOrder);
      socket.off('orders:updated', handleOrderUpdated);
      socket.off('orders:error', handleSocketError);
      socket.off('connect_error', handleConnectError);
      disconnectOrdersSocket();
    };
  }, [token, restaurantName, isOnline, scheduleOnlineReload]);

  // هنگام رفرش (سوکت، تغییر وضعیت، ثبت پرداخت) سفارشات قبلی روی صفحه
  // می‌مانند تا صفحه پرش نکند؛ spinner فقط بار اول (وقتی هنوز داده‌ای نیست)
  // نمایش داده می‌شود — الگوی stale-while-revalidate.
  const loadOnlineOrders = async (isRefresh = false) => {
    if (!isOnline) return;
    if (!token) {
      toast.warning('برای مشاهده سفارشات آنلاین، ابتدا وارد شوید.');
      setOnlineOrders([]);
      setOnlineMeta(DEFAULT_ONLINE_META);
      return;
    }
    if (!isRefresh) setOnlineLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: pageSize,
      };
      if (restaurantName) params.restaurantName = restaurantName;
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await fetchOrders(params, token);
      const data = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
      const meta =
        !Array.isArray(response) && response?.meta
          ? response.meta
          : {
              ...DEFAULT_ONLINE_META,
              page: currentPage,
              limit: pageSize,
              total: data.length,
            };
      setOnlineOrders(data);
      setOnlineMeta(meta);

      if (meta.totalPages > 0 && currentPage > meta.totalPages) {
        setCurrentPage(meta.totalPages);
      }
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      toast.error(error?.response?.data?.message || 'خطا در دریافت سفارشات آنلاین');
      // اگر خطای شبکه‌ای است (آفلاین شدیم در حین درخواست)، داده‌های قبلی را نگه‌دار
      // فقط در صورت خطای سرور (مثل 400/401/500) لیست پاک می‌شود
      if (error?.response) {
        setOnlineOrders([]);
        setOnlineMeta(DEFAULT_ONLINE_META);
      }
    } finally {
      setOnlineLoading(false);
      if (window.electronAPI?.getReceiptNumbersMap) {
        loadReceiptNumbersMap();
      }
    }
  };
  // نگه‌داشتن آخرین loadOnlineOrders در ref تا scheduleOnlineReload همیشه
  // نسخهٔ به‌روز را صدا بزند بدون آنکه socket effect بازتولید شود.
  loadOnlineOrdersRef.current = loadOnlineOrders;

  const loadOfflineOrders = async () => {
    setOfflineLoading(true);
    try {
      const orders = await getAllOrders();
      const unsynced = Array.isArray(orders) ? orders.filter((order) => !order.synced) : [];
      setOfflineOrders(unsynced);
    } catch (error) {
      console.error('Failed to load offline orders:', error);
      toast.error('خطا در دریافت سفارشات آفلاین');
    } finally {
      setOfflineLoading(false);
      if (window.electronAPI?.getReceiptNumbersMap) {
        loadReceiptNumbersMap();
      }
    }
  };

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const { accountingDb } = await import('../../services/accountingLocalDb');
        const restaurantId = user?.restaurants?.[0]?.id;
        if (!restaurantId) return;
        const accounts = await accountingDb.cashBankAccounts
          .where('restaurantId')
          .equals(Number(restaurantId))
          .toArray();
        setCashBankAccounts(accounts || []);
        if (accounts?.length) setCreditPayAccountId(String(accounts[0].id));
      } catch {
        setCashBankAccounts([]);
      }
    };
    void loadAccounts();
  }, [user?.restaurants]);

  return {
    loadOnlineOrders,
    loadOfflineOrders,
  };
}
