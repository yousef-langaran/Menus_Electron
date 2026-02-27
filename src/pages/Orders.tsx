import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchOrders, updateOrderStatus } from '../services/api';

const ORDERS_PAGE_SIZE = 50;
import { getAllOrders } from '../services/offlineStorage';
import { connectOrdersSocket, disconnectOrdersSocket } from '../services/ordersSocket';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import {
  getReceiptNumbersMapFromStorage,
  saveReceiptNumbersToStorage,
} from '../utils/receiptNumbersStorage';
import { Card, CardBody, Button, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip, Checkbox } from '@heroui/react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'confirmed', label: 'تایید شده' },
  { value: 'preparing', label: 'در حال آماده‌سازی' },
  { value: 'ready', label: 'آماده تحویل' },
  { value: 'delivered', label: 'تحویل شده' },
  { value: 'cancelled', label: 'لغو شده' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  confirmed: 'تایید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده تحویل',
  delivered: 'تحویل شده',
  cancelled: 'لغو شده',
};

const formatPrice = (price?: number) =>
  typeof price === 'number' ? `${new Intl.NumberFormat('fa-IR').format(price)} تومان` : '-';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('fa-IR') : '-');

export default function OrdersPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlineOrders, setOnlineOrders] = useState<any[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [offlineError, setOfflineError] = useState('');
  const [statusUpdateLoading, setStatusUpdateLoading] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const printerConfigs = usePrinterSettingsStore((state) => state.configs);
  const loadPrinterConfigs = usePrinterSettingsStore((state) => state.loadFromStorage);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [receiptNumbersMap, setReceiptNumbersMap] = useState<Record<string, number>>({});
  /** پرینتری که تنظیماتش برای پیش‌نمایش استفاده می‌شود */
  const [previewPrinterName, setPreviewPrinterName] = useState<string>('');
  /** دادهٔ سفارش برای بازسازی پیش‌نمایش هنگام تعویض پرینتر */
  const [previewOrderPayload, setPreviewOrderPayload] = useState<any>(null);
  /** مودال چاپ مجدد: سفارش و پرینترهای انتخاب‌شده */
  const [reprintModalOpen, setReprintModalOpen] = useState(false);
  const [reprintOrder, setReprintOrder] = useState<any>(null);
  const [reprintIsOffline, setReprintIsOffline] = useState(false);
  const [reprintSelectedPrinters, setReprintSelectedPrinters] = useState<string[]>([]);
  const [reprintLoading, setReprintLoading] = useState(false);
  /** آیا صفحهٔ بعدی سفارشات آنلاین وجود دارد */
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const restaurantName = useMemo(() => {
    const name = user?.restaurants?.[0]?.name;
    console.log('[OrdersPage] Restaurant name resolved:', { name, userRestaurants: user?.restaurants });
    return name;
  }, [user]);
  const restaurantNameFa = useMemo(
    () => user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || '',
    [user]
  );
  const enabledPrinters = useMemo(
    () => Object.values(printerConfigs || {}).filter((config) => config.enabled),
    [printerConfigs]
  );
  const primaryPrinter = enabledPrinters[0];
  const isElectronEnv = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const canPrint = isElectronEnv && enabledPrinters.length > 0;

  // وقتی پرینترها لود شدند، پرینتر پیش‌نمایش را روی اولین پرینتر بگذار
  useEffect(() => {
    if (enabledPrinters.length > 0 && !previewPrinterName) {
      setPreviewPrinterName(enabledPrinters[0].name);
    }
  }, [enabledPrinters, previewPrinterName]);

  const detectOnlineStatus = async () => {
    try {
      if (window.electronAPI?.checkOnline) {
        return await window.electronAPI.checkOnline();
      }
    } catch (error) {
      console.error('Failed to check online status:', error);
    }
    return navigator.onLine;
  };

  useEffect(() => {
    loadPrinterConfigs();
  }, [loadPrinterConfigs]);

  const loadReceiptNumbersMap = async () => {
    const fromStorage = getReceiptNumbersMapFromStorage();
    if (window.electronAPI?.getReceiptNumbersMap) {
      try {
        const fromMain = (await window.electronAPI.getReceiptNumbersMap()) || {};
        setReceiptNumbersMap({ ...fromStorage, ...fromMain });
      } catch {
        setReceiptNumbersMap(fromStorage);
      }
    } else {
      setReceiptNumbersMap(fromStorage);
    }
  };

  useEffect(() => {
    loadReceiptNumbersMap();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && window.electronAPI?.getReceiptNumbersMap) {
        loadReceiptNumbersMap();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
          setOnlineOrders([]);
          setOnlineError('');
          setSyncMessage('شما آفلاین هستید. سفارشات جدید در حافظه نگهداری می‌شوند.');
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
        setOnlineOrders([]);
        setOnlineError('');
        setSyncMessage('شما آفلاین هستید. سفارشات جدید در حافظه نگهداری می‌شوند.');
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
  }, [statusFilter, isOnline]);

  useEffect(() => {
    console.log('[OrdersPage] Socket effect triggered', {
      hasToken: !!token,
      restaurantName,
      isOnline,
    });

    if (!token || !restaurantName || !isOnline) {
      console.warn('[OrdersPage] Missing requirements, disconnecting socket');
      disconnectOrdersSocket();
      return;
    }

    console.log('[OrdersPage] Attempting to connect socket...');
    const socket = connectOrdersSocket({ token, restaurantName });
    if (!socket) {
      console.error('[OrdersPage] Failed to create socket');
      return;
    }

    console.log('[OrdersPage] Socket created, setting up listeners');

    const handleNewOrder = (order: any) => {
      setOnlineOrders((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== order.id);
        if (statusFilter !== 'all' && order.status !== statusFilter) {
          return withoutCurrent;
        }
        return [order, ...withoutCurrent];
      });
      setSyncMessage(`سفارش جدید ${order.orderNumber || order.id} ثبت شد.`);
    };

    const handleOrderUpdated = (order: any) => {
      setOnlineOrders((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== order.id);
        if (statusFilter !== 'all' && order.status !== statusFilter) {
          return withoutCurrent;
        }
        return [order, ...withoutCurrent];
      });
    };

    const handleSocketError = (message: any) => {
      const resolvedMessage =
        typeof message === 'string' ? message : 'خطا در ارتباط زنده سفارش‌ها.';
      setSyncMessage(resolvedMessage);
    };

    const handleConnect = () => {
      // اتصال زنده برقرار است؛ پیام جداگانه نشان داده نمی‌شود.
    };

    const handleConnectError = (error: Error) => {
      console.error('Orders socket connection error:', error);
      setSyncMessage('اتصال سوکت سفارش‌ها برقرار نشد.');
    };

    socket.on('connect', handleConnect);
    socket.on('orders:new', handleNewOrder);
    socket.on('orders:updated', handleOrderUpdated);
    socket.on('orders:error', handleSocketError);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('orders:new', handleNewOrder);
      socket.off('orders:updated', handleOrderUpdated);
      socket.off('orders:error', handleSocketError);
      socket.off('connect_error', handleConnectError);
      disconnectOrdersSocket();
    };
  }, [token, restaurantName, isOnline, statusFilter]);

  const loadOnlineOrders = async () => {
    if (!isOnline) return;
    if (!token) {
      setOnlineError('برای مشاهده سفارشات آنلاین، ابتدا وارد شوید.');
      setOnlineOrders([]);
      setHasMoreOrders(false);
      return;
    }
    setOnlineLoading(true);
    setOnlineError('');
    setHasMoreOrders(false);
    try {
      const params: Record<string, string | number> = {
        limit: ORDERS_PAGE_SIZE + 1,
        offset: 0,
      };
      if (restaurantName) params.restaurantName = restaurantName;
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await fetchOrders(params, token);
      const data = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
      const hasMore = data.length > ORDERS_PAGE_SIZE;
      setOnlineOrders(hasMore ? data.slice(0, ORDERS_PAGE_SIZE) : data);
      setHasMoreOrders(hasMore);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      setOnlineError(error?.response?.data?.message || 'خطا در دریافت سفارشات آنلاین');
    } finally {
      setOnlineLoading(false);
      if (window.electronAPI?.getReceiptNumbersMap) {
        loadReceiptNumbersMap();
      }
    }
  };

  const loadMoreOrders = async () => {
    if (!token || loadingMore || !hasMoreOrders) return;
    setLoadingMore(true);
    try {
      const params: Record<string, string | number> = {
        limit: ORDERS_PAGE_SIZE + 1,
        offset: onlineOrders.length,
      };
      if (restaurantName) params.restaurantName = restaurantName;
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await fetchOrders(params, token);
      const data = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
      const hasMore = data.length > ORDERS_PAGE_SIZE;
      const next = hasMore ? data.slice(0, ORDERS_PAGE_SIZE) : data;
      setOnlineOrders((prev) => [...prev, ...next]);
      setHasMoreOrders(hasMore);
    } catch (error: any) {
      console.error('Failed to load more orders:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadOfflineOrders = async () => {
    setOfflineLoading(true);
    setOfflineError('');
    try {
      const orders = await getAllOrders();
      const unsynced = Array.isArray(orders) ? orders.filter((order) => !order.synced) : [];
      setOfflineOrders(unsynced);
    } catch (error) {
      console.error('Failed to load offline orders:', error);
      setOfflineError('خطا در دریافت سفارشات آفلاین');
    } finally {
      setOfflineLoading(false);
      if (window.electronAPI?.getReceiptNumbersMap) {
        loadReceiptNumbersMap();
      }
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    setStatusUpdateLoading(orderId);
    try {
      await updateOrderStatus(orderId, status, token || undefined);
      await loadOnlineOrders();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      setOnlineError(error?.response?.data?.message || 'خطا در تغییر وضعیت سفارش');
    } finally {
      setStatusUpdateLoading(null);
    }
  };

  const syncAndRefresh = async (auto = false) => {
        if (!window.electronAPI?.syncOrders) {
      await loadOnlineOrders();
      return;
    }

    setSyncInProgress(true);
    setSyncMessage(auto ? 'در حال همگام‌سازی خودکار سفارشات...' : 'در حال ارسال سفارشات آفلاین...');
    try {
          const result = await window.electronAPI.syncOrders(token || undefined);
        if (result) {
          const unauthorizedError = Array.isArray(result.errors)
            ? result.errors.find((msg: string) => typeof msg === 'string' && /unauthorized/i.test(msg))
            : null;

          if (unauthorizedError) {
            setSyncMessage('نشست شما منقضی شده است. لطفاً دوباره وارد شوید و سپس همگام‌سازی را تکرار کنید.');
            if (!auto) {
              await logout();
              navigate('/login');
            }
            return;
          }

          setSyncMessage(`ارسال انجام شد: ${result.success} موفق، ${result.failed} ناموفق`);
        }
      await loadOfflineOrders();
      await loadOnlineOrders();
    } catch (error: any) {
      console.error('Sync error:', error);
      setSyncMessage(error?.message || 'خطا در همگام‌سازی سفارشات آفلاین');
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleManualSync = () => {
    if (!isOnline) {
      setSyncMessage('برای ارسال سفارشات آفلاین ابتدا باید آنلاین شوید.');
      return;
    }
    syncAndRefresh();
  };

  const normalizeOrderForReceipt = (order: any, isOffline = false) => {
    if (isOffline) {
      const payload = { ...(order?.orderData || {}) };
      if (!payload.orderNumber) {
        payload.orderNumber = order.orderData?.orderNumber || order.id;
      }
      if (!payload.id) {
        payload.id = order.id;
      }
      if (!payload.createdAt) {
        payload.createdAt = order.createdAt;
      }
      if (!payload.items && order.orderData?.items) {
        payload.items = order.orderData.items;
      }
      payload.restaurantName = payload.restaurantName || restaurantNameFa || restaurantName || '';
      return payload;
    }
    const payload = { ...order };
    if (!payload.orderNumber && payload.id != null) {
      payload.orderNumber = payload.orderNumber || payload.order_number || `ORD-${payload.id}`;
    }
    payload.restaurantName = payload.restaurantName || restaurantNameFa || restaurantName || '';
    return payload;
  };

  /** تنظیمات پیش‌نمایش بر اساس پرینتر انتخاب‌شده (قالب/کاغذ آن پرینتر) */
  const getPreviewOptionsForPrinter = async (printerName: string) => {
    const printer = enabledPrinters.find((p) => p.name === printerName) || primaryPrinter;
    let paperWidth = printer?.paperWidth ?? 80;
    let margin = printer?.margin ?? 5;
    let layout: { version: 2; rows: any[] } | undefined;
    if (window.electronAPI?.getPrintTemplatesMap) {
      const templatesMap = await window.electronAPI.getPrintTemplatesMap();
      const template = templatesMap?.[printerName] ?? null;
      if (template) {
        paperWidth = template.paperWidth ?? paperWidth;
        margin = template.margin ?? margin;
        if (template.layout != null) {
          const raw = template.layout;
          if (Array.isArray(raw) && raw.length > 0) {
            layout = { version: 2, rows: raw };
          } else if (typeof raw === 'object' && raw.version === 2 && Array.isArray((raw as any).rows)) {
            layout = raw as { version: 2; rows: any[] };
          }
        }
      }
    }
    const isNarrow = paperWidth <= 62;
    const shiftLeftMm = isNarrow ? 12 : 14;
    const contentWidthMm = Math.max(32, paperWidth - margin * 2 - shiftLeftMm);
    const options: Record<string, unknown> = {
      paperWidth,
      margin,
      contentWidthMm,
      shiftLeftMm,
      receiptType: 'full' as const,
    };
    if (layout) options.layout = layout;
    return options;
  };

  const runPreviewWithPrinter = async (orderPayload: any, printerName: string) => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const options = await getPreviewOptionsForPrinter(printerName);
      if (window.electronAPI?.generateReceiptPreview) {
        const result = await window.electronAPI.generateReceiptPreview(orderPayload, options);
        if (!result?.success) {
          throw new Error(result?.error || 'امکان ساخت پیش‌نمایش وجود ندارد.');
        }
        setPreviewHtml(result.html || '');
        setPreviewImage(result.imageDataUrl || '');
      } else {
        setPreviewError('پیش‌نمایش رسید فقط در نسخهٔ دسکتاپ (اپ الکترون) در دسترس است.');
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      setPreviewError(error?.message || 'خطا در ساخت پیش‌نمایش رسید');
    } finally {
      setPreviewLoading(false);
    }
  };

  const openReceiptPreview = async (orderPayload: any, title: string, printerName?: string) => {
    const targetPrinter = printerName || previewPrinterName || primaryPrinter?.name || '';
    setPreviewOrderPayload(orderPayload);
    setPreviewTitle(title);
    setPreviewPrinterName(targetPrinter);
    setPreviewHtml('');
    setPreviewImage('');
    setPreviewError('');
    setPreviewVisible(true);
    await runPreviewWithPrinter(orderPayload, targetPrinter);
  };

  const handlePreviewPrinterChange = async (newPrinterName: string) => {
    setPreviewPrinterName(newPrinterName);
    if (previewOrderPayload) {
      await runPreviewWithPrinter(previewOrderPayload, newPrinterName);
    }
  };

  const handlePreviewOrder = (order: any, isOffline = false) => {
    const normalized = normalizeOrderForReceipt(order, isOffline);
    if (!isOffline && normalized.receiptCallNumber == null) {
      const fromMap = receiptNumbersMap[String(order.id)] ?? receiptNumbersMap[order.orderNumber];
      if (fromMap != null) normalized.receiptCallNumber = fromMap;
    }
    const title = isOffline
      ? `پیش‌نمایش سفارش آفلاین #${order?.id || ''}`
      : `پیش‌نمایش سفارش #${order?.orderNumber || order?.id || ''}`;
    openReceiptPreview(normalized, title);
  };

  const openReprintModal = (order: any, isOffline = false) => {
    if (!enabledPrinters.length) {
      setSyncMessage('ابتدا در صفحه تنظیمات، حداقل یک پرینتر را فعال کنید.');
      return;
    }
    setReprintOrder(order);
    setReprintIsOffline(isOffline);
    setReprintSelectedPrinters(enabledPrinters.map((p) => p.name));
    setReprintModalOpen(true);
  };

  const doReprint = async () => {
    if (!window.electronAPI?.printReceipt || !reprintOrder || reprintSelectedPrinters.length === 0) {
      return;
    }
    setReprintLoading(true);
    try {
      const [templatesMap, defaultTemplate] = await Promise.all([
        window.electronAPI?.getPrintTemplatesMap?.() ?? Promise.resolve({}),
        window.electronAPI?.getDefaultPrintTemplate?.() ?? Promise.resolve(null),
      ]);
      const printersToUse = enabledPrinters.filter((p) => reprintSelectedPrinters.includes(p.name));
      const printerJobs = printersToUse.map((printer) => {
        const template = templatesMap?.[printer.name] ?? defaultTemplate ?? null;
        return {
          name: printer.name,
          displayName: printer.displayName,
          paperWidth: template?.paperWidth ?? printer.paperWidth,
          paperLength: template?.paperLength ?? printer.paperLength,
          margin: template?.margin ?? printer.margin,
          receiptType: 'full' as const,
          copies: 1,
          layout: template?.layout ?? undefined,
        };
      });
      const orderKeys = reprintIsOffline
        ? [`offline-${reprintOrder.id}`]
        : [String(reprintOrder.id), reprintOrder.orderNumber].filter(Boolean);
      const res = await window.electronAPI.printReceipt(
        normalizeOrderForReceipt(reprintOrder, reprintIsOffline),
        printerJobs,
        orderKeys
      );
      if (res?.receiptNumber && orderKeys.length) {
        saveReceiptNumbersToStorage(orderKeys, res.receiptNumber);
        setReceiptNumbersMap((prev) => {
          const next = { ...prev };
          orderKeys.forEach((k) => {
            next[k] = res.receiptNumber!;
          });
          return next;
        });
      }
      setSyncMessage(`چاپ مجدد با ${printersToUse.map((p) => p.displayName || p.name).join('، ')} انجام شد.`);
      setReprintModalOpen(false);
      setReprintOrder(null);
      loadReceiptNumbersMap();
    } catch (error: any) {
      console.error('Reprint error:', error);
      setSyncMessage(error?.message || 'خطا در ارسال به پرینتر');
    } finally {
      setReprintLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewHtml('');
    setPreviewError('');
    setPreviewImage('');
    setPreviewTitle('');
    setPreviewOrderPayload(null);
    setPreviewLoading(false);
  };

  const statusColorMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
    pending: 'warning',
    confirmed: 'primary',
    preparing: 'primary',
    ready: 'success',
    delivered: 'success',
    cancelled: 'danger',
  };

  const renderOnlineOrders = () => {
    if (onlineLoading) {
      return <div className="py-12 text-center text-default-500">در حال بارگذاری...</div>;
    }
    if (onlineError) {
      return <div className="py-4 text-danger text-center">{onlineError}</div>;
    }
    if (!onlineOrders.length) {
      return <div className="py-12 text-center text-default-500">سفارشی برای نمایش وجود ندارد.</div>;
    }
    return (
      <div className="flex flex-col gap-4">
        {onlineOrders.map((order: any) => (
          <Card key={order.id} shadow="sm" className="border border-default-200">
            <CardBody className="gap-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-semibold text-foreground">سفارش #{order.orderNumber || order.id}</h3>
                <Chip size="sm" color={statusColorMap[order.status] || 'default'} variant="flat">
                  {STATUS_LABELS[order.status] || order.status}
                </Chip>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
                <div><strong>شماره رسید فراخوانی:</strong> {order.receiptCallNumber ?? receiptNumbersMap[String(order.id)] ?? receiptNumbersMap[order.orderNumber] ?? '—'}</div>
                <div>مشتری: {order.customerName || order.customerPhone || '---'}</div>
                <div>تلفن: {order.customerPhone || '---'}</div>
                <div>نوع: {order.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}</div>
                <div>پرداخت: {order.paymentMethod || '---'}</div>
                <div>مبلغ کل: {formatPrice(order.totalAmount)}</div>
                <div>تخفیف: {formatPrice(order.discountAmount)}</div>
                <div>مبلغ نهایی: {formatPrice(order.finalAmount)}</div>
                <div>تاریخ: {formatDate(order.createdAt)}</div>
              </div>
              {order.notes && (
                <p className="text-default-500 text-sm"><strong>یادداشت:</strong> {order.notes}</p>
              )}
              {order.items?.length > 0 && (
                <ul className="list-disc list-inside text-sm text-foreground">
                  {order.items.map((item: any, idx: number) => (
                    <li key={idx}>
                      {item.product?.name_fa || item.productName || 'محصول'} - {item.quantity} × {formatPrice(item.price)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-default-200">
                <Button size="sm" variant="flat" onPress={() => handlePreviewOrder(order)}>پیش‌نمایش رسید</Button>
                <Button size="sm" variant="flat" color="primary" onPress={() => openReprintModal(order)} isDisabled={!canPrint}>چاپ مجدد</Button>
                <Select
                  size="sm"
                  className="max-w-40"
                  selectedKeys={[order.status]}
                  onSelectionChange={(keys) => { const v = Array.from(keys)[0]; if (v) handleStatusChange(order.id, v as string); }}
                  isDisabled={statusUpdateLoading === order.id}
                  variant="bordered"
                  label="وضعیت"
                >
                  {STATUS_OPTIONS.filter((opt) => opt.value !== 'all').map((option) => (
                    <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
                  ))}
                </Select>
              </div>
            </CardBody>
          </Card>
        ))}
        {hasMoreOrders && (
          <div className="flex justify-center py-4">
            <Button
              variant="flat"
              color="primary"
              onPress={loadMoreOrders}
              isLoading={loadingMore}
              isDisabled={loadingMore}
            >
              {loadingMore ? 'در حال بارگذاری...' : 'بارگذاری بیشتر'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderOfflineOrders = () => {
    if (offlineLoading) {
      return <div className="py-12 text-center text-default-500">در حال بارگذاری سفارشات آفلاین...</div>;
    }
    if (offlineError) {
      return <div className="py-4 text-danger text-center">{offlineError}</div>;
    }
    if (!offlineOrders.length) {
      return <div className="py-12 text-center text-default-500">سفارشی در حافظه آفلاین وجود ندارد.</div>;
    }
    return (
      <div className="flex flex-col gap-4">
        {offlineOrders.map((order: any) => (
          <Card key={order.id} shadow="sm" className="border border-default-200 bg-warning-50/30">
            <CardBody className="gap-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-semibold text-foreground">سفارش آفلاین #{order.id}</h3>
                <Chip size="sm" color="warning" variant="flat">در انتظار ارسال</Chip>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
                <div><strong>شماره رسید فراخوانی:</strong> {receiptNumbersMap[`offline-${order.id}`] ?? '—'}</div>
                <div>مشتری: {order.orderData?.customerPhone || '---'}</div>
                <div>نوع: {order.orderData?.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}</div>
                <div>مبلغ کل: {formatPrice(order.orderData?.totalAmount)}</div>
                <div>مبلغ نهایی: {formatPrice(order.orderData?.finalAmount)}</div>
                <div>تاریخ ثبت: {formatDate(order.createdAt)}</div>
              </div>
              {order.orderData?.notes && (
                <p className="text-default-500 text-sm"><strong>یادداشت:</strong> {order.orderData.notes}</p>
              )}
              {order.orderData?.items?.length > 0 && (
                <ul className="list-disc list-inside text-sm text-foreground">
                  {order.orderData.items.map((item: any, idx: number) => (
                    <li key={idx}>
                      {item.product?.name_fa || item.productName || 'محصول'} - {item.quantity} × {formatPrice(item.price)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-default-200">
                <Button size="sm" variant="flat" onPress={() => handlePreviewOrder(order, true)}>پیش‌نمایش رسید</Button>
                <Button size="sm" variant="flat" color="primary" onPress={() => openReprintModal(order, true)} isDisabled={!canPrint}>چاپ مجدد</Button>
                <span className="text-default-500 text-sm">این سفارش به محض اتصال ارسال می‌شود.</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-default-100">
      <header className="bg-content1 border-b border-default-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-foreground">لیست سفارشات</h1>
        <div className="flex gap-2">
          <Button variant="flat" color="default" onPress={() => navigate('/order')}>ثبت سفارش</Button>
          <Button variant="flat" color="default" onPress={() => navigate('/settings')}>تنظیمات</Button>
          <Button color="danger" variant="flat" onPress={logout}>خروج</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-4xl mx-auto w-full">
        <Card>
          <CardBody className="gap-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className={`flex items-center gap-2 font-semibold ${isOnline ? 'text-success' : 'text-danger'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-current" />
                {isOnline ? 'شما آنلاین هستید' : 'شما آفلاین هستید'}
              </div>
            </div>

            {syncMessage && (
              <div className="px-4 py-2 rounded-lg bg-primary-50 text-primary-700 text-sm">{syncMessage}</div>
            )}

            {!isOnline && offlineOrders.length > 0 && (
              <p className="text-default-500 text-sm">
                {offlineOrders.length} سفارش در صف ارسال قرار دارد و پس از اتصال به اینترنت به صورت خودکار ارسال می‌شود.
              </p>
            )}

            {isOnline && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  size="sm"
                  className="max-w-48"
                  selectedKeys={[statusFilter]}
                  onSelectionChange={(keys) => { const v = Array.from(keys)[0]; if (v) setStatusFilter(v as string); }}
                  variant="bordered"
                  label="وضعیت"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
                  ))}
                </Select>
                <Button size="sm" variant="flat" onPress={loadOnlineOrders}>بروزرسانی</Button>
              </div>
            )}

            <h2 className="text-lg font-semibold text-foreground">
              {isOnline ? 'سفارشات آنلاین' : 'سفارشات آفلاین (در انتظار اتصال)'}
            </h2>

            {isOnline ? renderOnlineOrders() : renderOfflineOrders()}
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={previewVisible} onOpenChange={(open) => !open && closePreview()} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-2">
            <div className="flex flex-row justify-between items-center w-full">
              <h3 className="text-lg font-semibold">{previewTitle || 'پیش‌نمایش رسید'}</h3>
              <Button size="sm" variant="light" isIconOnly onPress={closePreview}>×</Button>
            </div>
            {enabledPrinters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 w-full">
                <span className="text-sm text-default-500">پیش‌نمایش با تنظیمات پرینتر:</span>
                <Select
                  size="sm"
                  className="max-w-56"
                  selectedKeys={previewPrinterName ? [previewPrinterName] : []}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys)[0] as string;
                    if (v) handlePreviewPrinterChange(v);
                  }}
                  variant="bordered"
                  placeholder="انتخاب پرینتر"
                >
                  {enabledPrinters.map((p) => (
                    <SelectItem key={p.name} textValue={p.displayName || p.name}>
                      {p.displayName || p.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            )}
          </ModalHeader>
          <ModalBody>
            {previewLoading ? (
              <div className="py-12 text-center text-default-500">در حال آماده‌سازی پیش‌نمایش...</div>
            ) : previewError ? (
              <div className="py-4 text-danger text-center">{previewError}</div>
            ) : previewImage ? (
              <img src={previewImage} alt="receipt-preview" className="max-w-full h-auto mx-auto" />
            ) : (
              <iframe title="receipt-preview" className="w-full min-h-[400px] border-0 rounded-lg" srcDoc={previewHtml || ''} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closePreview}>بستن</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={reprintModalOpen} onOpenChange={setReprintModalOpen} size="md">
        <ModalContent>
          <ModalHeader>چاپ مجدد – انتخاب پرینتر</ModalHeader>
          <ModalBody className="gap-3">
            <p className="text-sm text-default-500">
              با کدام پرینتر چاپ مجدد انجام شود؟
            </p>
            {reprintOrder && (
              <p className="text-sm font-medium">
                سفارش #{reprintIsOffline ? reprintOrder.id : (reprintOrder.orderNumber || reprintOrder.id)}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {enabledPrinters.map((printer) => (
                <Checkbox
                  key={printer.name}
                  isSelected={reprintSelectedPrinters.includes(printer.name)}
                  onValueChange={(checked) => {
                    if (checked) {
                      setReprintSelectedPrinters((prev) => [...prev, printer.name]);
                    } else {
                      setReprintSelectedPrinters((prev) => prev.filter((n) => n !== printer.name));
                    }
                  }}
                >
                  {printer.displayName || printer.name}
                </Checkbox>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setReprintModalOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              onPress={doReprint}
              isDisabled={reprintSelectedPrinters.length === 0}
              isLoading={reprintLoading}
            >
              چاپ با پرینترهای انتخاب‌شده
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}



