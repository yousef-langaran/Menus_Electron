import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchOrders, fetchOrderById, updateOrderStatus, createCreditPayment } from '../services/api';
import CreateOrderReturnModal from '../components/CreateOrderReturnModal';
import { getAllOrders } from '../services/offlineStorage';
import { hasModuleAccess } from '../lib/electronPermissions';
import { connectOrdersSocket, disconnectOrdersSocket } from '../services/ordersSocket';
import { attachOrdersSocketPanelSidecar } from '../services/ordersSocketPanelSidecar';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import {
  getReceiptNumbersMapFromStorage,
  saveReceiptNumbersToStorage,
} from '../utils/receiptNumbersStorage';
import { toShamsiDateTime } from '../utils/date';
import {
  buildPrinterJobs,
  loadPrintTemplateSources,
  normalizeTemplateLayout,
  resolveTemplateForPrinter,
} from '../utils/printTemplates';
import { Card, CardContent, Modal, ModalHeader, ModalBody, ModalFooter, Chip, Input } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
import { ModalShell } from '../ui/modal-shell';
import { CheckboxCompat as Checkbox } from '../ui/compat-checkbox';
import { toast } from '../utils/toast';

const ORDERS_PAGE_SIZE = 20;
const ORDERS_PAGE_SIZE_OPTIONS = [20, 50, 100];

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
  typeof price === 'number' ? `${new Intl.NumberFormat('fa-IR').format(price)} ریال` : '-';

const formatDate = (value?: string) => toShamsiDateTime(value);

const DEFAULT_ONLINE_META = {
  page: 1,
  limit: ORDERS_PAGE_SIZE,
  offset: 0,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, logout } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlineOrders, setOnlineOrders] = useState<any[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState<number | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const printerConfigs = usePrinterSettingsStore((state) => state.configs);
  const loadPrinterConfigs = usePrinterSettingsStore((state) => state.loadFromStorage);
  const getPrinterReceipts = usePrinterSettingsStore((state) => state.getPrinterReceipts);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
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
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(ORDERS_PAGE_SIZE);
  const [onlineMeta, setOnlineMeta] = useState(DEFAULT_ONLINE_META);
  /** ایندکس سفارش جاری برای میانبر ← / → (ویرایش فاکتور) */
  const [listNavIndex, setListNavIndex] = useState(0);
  const [creditPayModalOpen, setCreditPayModalOpen] = useState(false);
  const [creditPayOrder, setCreditPayOrder] = useState<any>(null);
  const [creditPayAmount, setCreditPayAmount] = useState('');
  const [creditPayMethod, setCreditPayMethod] = useState<'cash' | 'card' | 'online'>('cash');
  const [creditPayAccountId, setCreditPayAccountId] = useState('');
  const [creditPayNotes, setCreditPayNotes] = useState('');
  const [creditPaySaving, setCreditPaySaving] = useState(false);
  const [cashBankAccounts, setCashBankAccounts] = useState<Array<{id: number; name: string; accountType: string}>>([]);
  const [creditPayHistory, setCreditPayHistory] = useState<any[]>([]);

  const restaurantName = useMemo(() => {
    const name = user?.restaurants?.[0]?.name;
    return name;
  }, [user]);
  const restaurantNameFa = useMemo(
    () => user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || '',
    [user]
  );
  const primaryRestaurantId = user?.restaurants?.[0]?.id;
  const canRegisterReturn = useMemo(
    () =>
      hasModuleAccess(
        user,
        'orders_management',
        ['update', 'create', 'manage'],
        primaryRestaurantId,
      ),
    [primaryRestaurantId, user],
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

  useEffect(() => {
    setListNavIndex((i) => {
      if (onlineOrders.length === 0) return 0;
      return Math.min(Math.max(i, 0), onlineOrders.length - 1);
    });
  }, [onlineOrders]);

  useEffect(() => {
    if (!isOnline || !onlineOrders.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (previewVisible || reprintModalOpen) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('input, textarea, [contenteditable="true"]')) return;
      if (active?.closest('[role="dialog"]')) return;
      if (active?.closest('[data-slot="select"]')) return;
      e.preventDefault();
      const max = onlineOrders.length - 1;
      const nextIndex =
        e.key === 'ArrowRight' ? Math.min(listNavIndex + 1, max) : Math.max(listNavIndex - 1, 0);
      setListNavIndex(nextIndex);
      const o = onlineOrders[nextIndex];
      if (o?.id != null) navigate(`/order?edit=${o.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOnline, onlineOrders, listNavIndex, previewVisible, reprintModalOpen, navigate]);

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

  // Debouncer برای جمع‌بست burst رویدادهای سوکت (orders:new/updated پشت‌سرهم)
  // تا به‌جای چندین درخواست fetch پشت‌سرهم، فقط یک رفرش سایلنت انجام شود.
  // شناسهٔ پایدار: همیشه به آخرین loadOnlineOrders از طریق ref اشاره می‌کند،
  // بنابراین socket effect با هر رندر بازتولید نمی‌شود.
  const onlineReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadOnlineOrdersRef = useRef<(isRefresh?: boolean) => Promise<void>>(
    async () => {},
  );
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
  }, [token, restaurantName, isOnline, statusFilter, currentPage, pageSize, scheduleOnlineReload]);

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
      const meta = !Array.isArray(response) && response?.meta
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
        const { accountingDb } = await import('../services/accountingLocalDb');
        const restaurantId = user?.restaurants?.[0]?.id;
        if (!restaurantId) return;
        const accounts = await accountingDb.cashBankAccounts
          .where('restaurantId').equals(Number(restaurantId))
          .toArray();
        setCashBankAccounts(accounts || []);
        if (accounts?.length) setCreditPayAccountId(String(accounts[0].id));
      } catch {
        setCashBankAccounts([]);
      }
    };
    void loadAccounts();
  }, [user?.restaurants]);

  const handleCreditPay = async () => {
    if (!creditPayOrder || !token || !creditPayAmount) return;
    const amt = Number(String(creditPayAmount).replace(/,/g, ''));
    if (!amt || amt <= 0) return;
    setCreditPaySaving(true);
    try {
      const restaurantName = user?.restaurants?.[0]?.name || '';
      const result = await createCreditPayment(
        Number(creditPayOrder.id),
        {
          amount: amt,
          restaurantName,
          notes: creditPayNotes.trim() || undefined,
          cashBankAccountId: creditPayAccountId ? Number(creditPayAccountId) : undefined,
          paymentMethod: creditPayMethod,
        },
        token,
      );
      // Record to local cash transactions
      try {
        const { recordCreditPaymentTransaction } = await import('../services/accountingLocalDb');
        const restaurantId = user?.restaurants?.[0]?.id;
        if (restaurantId) {
          await recordCreditPaymentTransaction({
            restaurantId: Number(restaurantId),
            accountType: creditPayMethod === 'cash' ? 'cash' : creditPayMethod === 'card' ? 'card' : 'online',
            amount: amt,
            orderId: creditPayOrder.id,
            orderNumber: creditPayOrder.orderNumber,
            customerPhone: creditPayOrder.customerPhone,
            description: creditPayNotes.trim() || undefined,
          });
        }
      } catch (localErr) {
        console.warn('[CreditPay] local tx record failed:', localErr);
      }
      toast.success(`پرداخت ${Number(amt).toLocaleString('fa-IR')} ریال ثبت شد`);
      if (result.isFullyPaid) toast.success('فاکتور کاملاً تسویه شد ✓');
      setCreditPayModalOpen(false);
      setCreditPayAmount('');
      setCreditPayNotes('');
      await loadOnlineOrders(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در ثبت پرداخت');
    } finally {
      setCreditPaySaving(false);
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    setStatusUpdateLoading(orderId);
    try {
      await updateOrderStatus(orderId, status, token || undefined);
      await loadOnlineOrders(true);
    } catch (error: any) {
      console.error('Failed to update status:', error);
      toast.error(error?.response?.data?.message || 'خطا در تغییر وضعیت سفارش');
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
    try {
          const result = await window.electronAPI.syncOrders(token || undefined);
          if (result) {
            const unauthorizedError = Array.isArray(result.errors)
              ? result.errors.find((msg: string) => typeof msg === 'string' && /unauthorized/i.test(msg))
              : null;

            if (unauthorizedError) {
              toast.warning('نشست شما منقضی شده است. لطفاً دوباره وارد شوید و سپس همگام‌سازی را تکرار کنید.');
              if (!auto) {
                await logout();
                navigate('/login');
              }
              return;
            }

            toast.success(`ارسال انجام شد: ${result.success} موفق، ${result.failed} ناموفق`);
          }
        await loadOfflineOrders();
        await loadOnlineOrders(true);
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error(error?.message || 'خطا در همگام‌سازی سفارشات آفلاین');
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleManualSync = () => {
    if (!isOnline) {
      toast.warning('برای ارسال سفارشات آفلاین ابتدا باید آنلاین شوید.');
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
      // صف آفلاین بدنهٔ ثبت سفارش را ذخیره می‌کند و آن بدنه فیلد جدا برای
      // ارزش افزوده ندارد (DTO سرور آن را نمی‌پذیرد). اما `finalAmount` ذخیره‌شده
      // شامل ارزش افزوده است، پس مبلغش از اختلاف با «جمع کل − تخفیف» درمی‌آید.
      if (payload.vatAmount == null) {
        const net = Number(payload.totalAmount || 0) - Number(payload.discountAmount || 0);
        const derived = Number(payload.finalAmount || 0) - net;
        payload.vatAmount = derived > 0 ? derived : 0;
      }
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
      const { templatesMap, defaultTemplate } = await loadPrintTemplateSources();
      // پیش‌نمایش همیشه رسید کامل است، پس قالبِ همان رسید را نشان می‌دهیم
      const template = resolveTemplateForPrinter(printerName, templatesMap, defaultTemplate, 'full');
      if (template) {
        paperWidth = template.paperWidth ?? paperWidth;
        margin = template.margin ?? margin;
        layout = normalizeTemplateLayout(template.layout);
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
        toast.error('پیش‌نمایش رسید فقط در نسخهٔ دسکتاپ (اپ الکترون) در دسترس است.');
        closePreview();
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      toast.error(error?.message || 'خطا در ساخت پیش‌نمایش رسید');
      closePreview();
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

  // ورود از طریق deep-link (secoin://order/<id>) — App.tsx به /orders?openOrderId=<id> ناوبری می‌کند
  useEffect(() => {
    const openOrderId = searchParams.get('openOrderId');
    if (!openOrderId || !token) return;

    let cancelled = false;
    (async () => {
      try {
        const order = await fetchOrderById(Number(openOrderId), token);
        if (!cancelled && order) {
          handlePreviewOrder(order, false);
        } else if (!cancelled) {
          toast.error('سفارش مورد نظر پیدا نشد');
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'خطا در دریافت سفارش');
        }
      } finally {
        if (!cancelled) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('openOrderId');
            return next;
          }, { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, token]);

  const openReprintModal = (order: any, isOffline = false) => {
    if (!enabledPrinters.length) {
      toast.warning('ابتدا در صفحه تنظیمات، حداقل یک پرینتر را فعال کنید.');
      return;
    }
    setReprintOrder(order);
    setReprintIsOffline(isOffline);
    setReprintSelectedPrinters(enabledPrinters.map((p) => p.name));
    setReprintModalOpen(true);
  };

  const openReturnModal = (order: any) => {
    setReturnOrder(order);
    setReturnModalOpen(true);
  };

  const handleReturnSuccess = () => {
    toast.success('مرجوعی با موفقیت ثبت شد');
    loadOnlineOrders(true);
  };

  const doReprint = async () => {
    if (!window.electronAPI?.printReceipt || !reprintOrder || reprintSelectedPrinters.length === 0) {
      return;
    }
    setReprintLoading(true);
    try {
      const { templatesMap, defaultTemplate } = await loadPrintTemplateSources();
      const printersToUse = enabledPrinters.filter((p) => reprintSelectedPrinters.includes(p.name));
      const printerJobs = buildPrinterJobs(printersToUse, getPrinterReceipts, templatesMap, defaultTemplate);
      if (printerJobs.length === 0) {
        throw new Error('برای پرینترهای انتخابی، نوع رسید فعالی تنظیم نشده است.');
      }
      const orderKeys = reprintIsOffline
        ? [`offline-${reprintOrder.id}`]
        : [String(reprintOrder.id), reprintOrder.orderNumber].filter(Boolean);
      const res = await window.electronAPI.printReceipt(
        normalizeOrderForReceipt(reprintOrder, reprintIsOffline),
        printerJobs,
        orderKeys
      );
      if (res?.status !== 'PRINT_OK') {
        throw new Error(res?.code || 'PRINT_UNKNOWN_ERROR');
      }
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
      toast.success(`چاپ مجدد با ${printersToUse.map((p) => p.displayName || p.name).join('، ')} انجام شد.`);
      setReprintModalOpen(false);
      setReprintOrder(null);
      loadReceiptNumbersMap();
    } catch (error: any) {
      console.error('Reprint error:', error);
      toast.error(error?.message || 'خطا در ارسال به پرینتر');
    } finally {
      setReprintLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewHtml('');
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
    if (!onlineOrders.length) {
      return <div className="py-12 text-center text-default-500">سفارشی برای نمایش وجود ندارد.</div>;
    }
    return (
      <div className="flex flex-col gap-4">
        {onlineOrders.map((order: any) => (
          <Card key={order.id} className="shadow-sm border border-default-200">
            <CardContent className="gap-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-semibold text-foreground">سفارش #{order.orderNumber || order.id}</h3>
                <Chip size="sm" color={statusColorMap[order.status] || 'default'} variant="soft">
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
                {Number(order.vatAmount ?? 0) > 0 && (
                  <div>ارزش افزوده: {formatPrice(Number(order.vatAmount))}</div>
                )}
                <div>مبلغ نهایی: {formatPrice(order.finalAmount)}</div>
                <div>تاریخ: {formatDate(order.createdAt)}</div>
              </div>
              {order.paymentMethod === 'credit' && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-warning-600 font-medium">
                    نسیه: مانده {Number(Math.max(0, (order.finalAmount ?? order.totalAmount ?? 0) - (order.creditPaidAmount ?? 0))).toLocaleString('fa-IR')} ریال
                  </span>
                  {((order.finalAmount ?? order.totalAmount ?? 0) - (order.creditPaidAmount ?? 0)) > 0 && (
                    <Button
                      size="sm"
                      color="success"
                      variant="flat"
                      onPress={() => {
                        setCreditPayOrder(order);
                        const remaining = (order.finalAmount ?? order.totalAmount ?? 0) - (order.creditPaidAmount ?? 0);
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
                <Button size="sm" variant="flat" onPress={() => handlePreviewOrder(order)}>پیش‌نمایش رسید</Button>
                <Button size="sm" variant="flat" color="primary" onPress={() => openReprintModal(order)} isDisabled={!canPrint}>چاپ مجدد</Button>
                {canRegisterReturn && (
                  <Button size="sm" variant="flat" color="warning" onPress={() => openReturnModal(order)}>
                    ثبت مرجوعی
                  </Button>
                )}
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
            </CardContent>
          </Card>
        ))}
        {onlineMeta.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-default-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-default-500 text-center sm:text-right">
              نمایش {onlineMeta.offset + 1} تا {Math.min(onlineMeta.offset + onlineMeta.limit, onlineMeta.total)} از {onlineMeta.total} سفارش
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
                  <SelectItem key={String(size)} textValue={`${size} در صفحه`}>{size} در صفحه</SelectItem>
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
                <span className="text-sm text-default-500 whitespace-nowrap">
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
  };

  const renderOfflineOrders = () => {
    if (offlineLoading) {
      return <div className="py-12 text-center text-default-500">در حال بارگذاری سفارشات آفلاین...</div>;
    }
    if (!offlineOrders.length) {
      return <div className="py-12 text-center text-default-500">سفارشی در حافظه آفلاین وجود ندارد.</div>;
    }
    return (
      <div className="flex flex-col gap-4">
        {offlineOrders.map((order: any) => (
          <Card key={order.id} className="shadow-sm border border-default-200 bg-warning-50/30">
            <CardContent className="gap-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-semibold text-foreground">سفارش آفلاین #{order.id}</h3>
                <Chip size="sm" color="warning" variant="soft">در انتظار ارسال</Chip>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
                <div><strong>شماره رسید فراخوانی:</strong> {receiptNumbersMap[`offline-${order.id}`] ?? '—'}</div>
                <div>مشتری: {order.orderData?.customerPhone || '---'}</div>
                <div>نوع: {order.orderData?.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}</div>
                <div>مبلغ کل: {formatPrice(order.orderData?.totalAmount)}</div>
                {Number(order.orderData?.vatAmount ?? 0) > 0 && (
                  <div>ارزش افزوده: {formatPrice(Number(order.orderData.vatAmount))}</div>
                )}
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
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-default-100">
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold text-foreground">لیست سفارشات</h1>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-4xl mx-auto w-full">
        <Card>
          <CardContent className="gap-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className={`flex items-center gap-2 font-semibold ${isOnline ? 'text-success' : 'text-danger'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-current" />
                {isOnline ? 'شما آنلاین هستید' : 'شما آفلاین هستید'}
              </div>
            </div>

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
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys)[0];
                    if (v) {
                      setStatusFilter(v as string);
                      setCurrentPage(1);
                    }
                  }}
                  variant="bordered"
                  label="وضعیت"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
                  ))}
                </Select>
                <Button size="sm" variant="flat" onPress={() => void loadOnlineOrders()}>بروزرسانی</Button>
                {onlineOrders.length > 0 && (
                  <p className="text-xs text-default-500 w-full sm:w-auto">
                    میانبر: ← و → برای رفتن به سفارش قبلی/بعدی در همین صفحه و باز کردن ویرایش فاکتور
                  </p>
                )}
              </div>
            )}

            {isOnline ? (
              <>
                <h2 className="text-lg font-semibold text-foreground">سفارشات آنلاین</h2>
                {renderOnlineOrders()}
              </>
            ) : (
              <>
                {offlineOrders.length > 0 && (
                  <>
                    <h2 className="text-lg font-semibold text-foreground">سفارشات آفلاین (در انتظار ارسال)</h2>
                    {renderOfflineOrders()}
                  </>
                )}
                {onlineOrders.length > 0 && (
                  <>
                    <h2 className="text-lg font-semibold text-foreground mt-4">
                      آخرین سفارشات بارگذاری‌شده
                      <span className="text-sm font-normal text-default-500 mr-2">(نمایش کش — ممکن است به‌روز نباشند)</span>
                    </h2>
                    {renderOnlineOrders()}
                  </>
                )}
                {offlineOrders.length === 0 && onlineOrders.length === 0 && (
                  <div className="py-12 text-center text-default-500">
                    سفارشی برای نمایش وجود ندارد.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={previewVisible} onOpenChange={(open) => !open && closePreview()}>
        <ModalShell size="full" scrollBehavior="inside">
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
            ) : previewImage ? (
              <img src={previewImage} alt="receipt-preview" className="max-w-full h-auto mx-auto" />
            ) : (
              <iframe title="receipt-preview" className="w-full min-h-[400px] border-0 rounded-lg" srcDoc={previewHtml || ''} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closePreview}>بستن</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      <Modal isOpen={reprintModalOpen} onOpenChange={setReprintModalOpen}>
        <ModalShell size="md">
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
        </ModalShell>
      </Modal>

      {returnOrder && token && restaurantName && (
        <CreateOrderReturnModal
          isOpen={returnModalOpen}
          onClose={() => setReturnModalOpen(false)}
          order={returnOrder}
          restaurantName={restaurantName}
          token={token}
          onSuccess={handleReturnSuccess}
        />
      )}

      {/* مودال دریافت پرداخت نسیه */}
      <Modal isOpen={creditPayModalOpen} onOpenChange={setCreditPayModalOpen}>
        <ModalShell size="md">
          <ModalHeader>دریافت پرداخت نسیه</ModalHeader>
          <ModalBody className="gap-4">
            {creditPayOrder && (
              <div className="bg-default-50 border border-default-200 rounded-lg p-3 text-sm space-y-1">
                <div className="font-semibold">فاکتور: {creditPayOrder.orderNumber || `#${creditPayOrder.id}`}</div>
                <div className="text-default-500">مشتری: {creditPayOrder.customerPhone || '—'}</div>
                <div className="text-default-500">
                  مبلغ کل: {Number(creditPayOrder.finalAmount ?? creditPayOrder.totalAmount ?? 0).toLocaleString('fa-IR')} ریال
                </div>
                <div className="text-warning-600 font-medium">
                  مانده: {Number(Math.max(0,(creditPayOrder.finalAmount ?? creditPayOrder.totalAmount ?? 0) - (creditPayOrder.creditPaidAmount ?? 0))).toLocaleString('fa-IR')} ریال
                </div>
              </div>
            )}
            <Input
              type="number"
              label="مبلغ دریافتی (ریال)"
              value={creditPayAmount}
              onValueChange={setCreditPayAmount}
              min={1}
              isRequired
            />
            <Select
              label="روش پرداخت"
              selectedKeys={[creditPayMethod]}
              onSelectionChange={(k) => setCreditPayMethod(String(Array.from(k)[0] || 'cash') as any)}
              variant="bordered"
            >
              <SelectItem key="cash">نقد (صندوق)</SelectItem>
              <SelectItem key="card">کارت</SelectItem>
              <SelectItem key="online">آنلاین</SelectItem>
            </Select>
            {cashBankAccounts.length > 0 && (
              <Select
                label="حساب"
                selectedKeys={creditPayAccountId ? [creditPayAccountId] : []}
                onSelectionChange={(k) => setCreditPayAccountId(String(Array.from(k)[0] || ''))}
                variant="bordered"
              >
                {cashBankAccounts.map((a) => (
                  <SelectItem key={String(a.id)}>
                    {a.name} ({a.accountType === 'cashbox' ? 'صندوق' : 'بانک'})
                  </SelectItem>
                ))}
              </Select>
            )}
            <Input
              label="یادداشت (اختیاری)"
              value={creditPayNotes}
              onValueChange={setCreditPayNotes}
              placeholder="مثلاً: پرداخت نقدی در محل"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreditPayModalOpen(false)}>انصراف</Button>
            <Button
              color="success"
              isLoading={creditPaySaving}
              isDisabled={!creditPayAmount || Number(creditPayAmount) <= 0}
              onPress={() => void handleCreditPay()}
            >
              ثبت پرداخت
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
