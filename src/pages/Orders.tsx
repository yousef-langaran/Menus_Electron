import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchOrderById } from '../services/api';
import CreateOrderReturnModal from '../components/CreateOrderReturnModal';
import { hasModuleAccess } from '../lib/electronPermissions';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { useOrderNavStore } from '../store/orderNavStore';
import {
  getReceiptNumbersMapFromStorage,
  saveReceiptNumbersToStorage,
} from '../utils/receiptNumbersStorage';
import { buildPrinterJobs, loadPrintTemplateSources } from '../utils/printTemplates';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
import { toast } from '../utils/toast';
import { ORDERS_PAGE_SIZE, STATUS_OPTIONS, DEFAULT_ONLINE_META } from './orders/shared';
import { OnlineOrdersList } from './orders/OnlineOrdersList';
import { OfflineOrdersList } from './orders/OfflineOrdersList';
import { OrderPreviewModal } from './orders/OrderPreviewModal';
import { OrderReprintModal } from './orders/OrderReprintModal';
import { CreditPayModal } from './orders/CreditPayModal';
import { useOrdersActions } from './orders/useOrdersActions';
import { useOrdersData } from './orders/useOrdersData';

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
  const [, setSyncInProgress] = useState(false);
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
  const [cashBankAccounts, setCashBankAccounts] = useState<
    Array<{ id: number; name: string; accountType: string }>
  >([]);
  const [, setCreditPayHistory] = useState<any[]>([]);

  const restaurantName = useMemo(() => {
    const name = user?.restaurants?.[0]?.name;
    return name;
  }, [user]);
  const restaurantNameFa = useMemo(
    () => user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || '',
    [user],
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
    [printerConfigs],
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

  // فهرست شناسه‌ها را در استور مشترک منتشر کن تا میانبر ← / → در صفحهٔ ویرایش سفارش
  // (بعد از رفتن به /order?edit=<id> و خروج این کامپوننت از DOM) هم کار کند
  useEffect(() => {
    useOrderNavStore
      .getState()
      .setOrderIds(onlineOrders.map((o) => o?.id).filter((id) => id != null));
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

  const { loadOnlineOrders, loadOfflineOrders } = useOrdersData({
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
  });

  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewHtml('');
    setPreviewImage('');
    setPreviewTitle('');
    setPreviewOrderPayload(null);
    setPreviewLoading(false);
  };

  const {
    handleCreditPay,
    handleStatusChange,
    normalizeOrderForReceipt,
    handlePreviewPrinterChange,
    handlePreviewOrder,
  } = useOrdersActions({
    creditPayOrder,
    token,
    creditPayAmount,
    setCreditPaySaving,
    restaurantName,
    user,
    creditPayNotes,
    creditPayAccountId,
    creditPayMethod,
    setCreditPayModalOpen,
    setCreditPayAmount,
    setCreditPayNotes,
    loadOnlineOrders,
    setStatusUpdateLoading,
    setSyncInProgress,
    logout,
    navigate,
    loadOfflineOrders,
    isOnline,
    restaurantNameFa,
    enabledPrinters,
    primaryPrinter,
    setPreviewLoading,
    setPreviewHtml,
    setPreviewImage,
    closePreview,
    previewPrinterName,
    setPreviewOrderPayload,
    setPreviewTitle,
    setPreviewPrinterName,
    setPreviewVisible,
    previewOrderPayload,
    receiptNumbersMap,
  });

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
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('openOrderId');
              return next;
            },
            { replace: true },
          );
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
    if (
      !window.electronAPI?.printReceipt ||
      !reprintOrder ||
      reprintSelectedPrinters.length === 0
    ) {
      return;
    }
    setReprintLoading(true);
    try {
      const { templatesMap, defaultTemplate } = await loadPrintTemplateSources();
      const printersToUse = enabledPrinters.filter((p) => reprintSelectedPrinters.includes(p.name));
      const printerJobs = buildPrinterJobs(
        printersToUse,
        getPrinterReceipts,
        templatesMap,
        defaultTemplate,
      );
      if (printerJobs.length === 0) {
        throw new Error('برای پرینترهای انتخابی، نوع رسید فعالی تنظیم نشده است.');
      }
      const orderKeys = reprintIsOffline
        ? [`offline-${reprintOrder.id}`]
        : [String(reprintOrder.id), reprintOrder.orderNumber].filter(Boolean);
      const res = await window.electronAPI.printReceipt(
        normalizeOrderForReceipt(reprintOrder, reprintIsOffline),
        printerJobs,
        orderKeys,
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
      toast.success(
        `چاپ مجدد با ${printersToUse.map((p) => p.displayName || p.name).join('، ')} انجام شد.`,
      );
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

  const statusColorMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
    pending: 'warning',
    confirmed: 'primary',
    preparing: 'primary',
    ready: 'success',
    delivered: 'success',
    cancelled: 'danger',
  };

  const renderOnlineOrders = () => (
    <OnlineOrdersList
      onlineLoading={onlineLoading}
      onlineOrders={onlineOrders}
      statusColorMap={statusColorMap}
      receiptNumbersMap={receiptNumbersMap}
      setCreditPayOrder={setCreditPayOrder}
      setCreditPayAmount={setCreditPayAmount}
      setCreditPayNotes={setCreditPayNotes}
      setCreditPayHistory={setCreditPayHistory}
      setCreditPayModalOpen={setCreditPayModalOpen}
      setListNavIndex={setListNavIndex}
      navigate={navigate}
      handlePreviewOrder={handlePreviewOrder}
      openReprintModal={openReprintModal}
      canPrint={canPrint}
      canRegisterReturn={canRegisterReturn}
      openReturnModal={openReturnModal}
      handleStatusChange={handleStatusChange}
      statusUpdateLoading={statusUpdateLoading}
      onlineMeta={onlineMeta}
      pageSize={pageSize}
      setPageSize={setPageSize}
      setCurrentPage={setCurrentPage}
    />
  );

  const renderOfflineOrders = () => (
    <OfflineOrdersList
      offlineLoading={offlineLoading}
      offlineOrders={offlineOrders}
      receiptNumbersMap={receiptNumbersMap}
      handlePreviewOrder={handlePreviewOrder}
      openReprintModal={openReprintModal}
      canPrint={canPrint}
    />
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="shrink-0 bg-surface border-b border-border px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold text-foreground">لیست سفارشات</h1>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-4xl mx-auto w-full">
        <Card>
          <CardContent className="gap-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div
                className={`flex items-center gap-2 font-semibold ${isOnline ? 'text-success' : 'text-danger'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-current" />
                {isOnline ? 'شما آنلاین هستید' : 'شما آفلاین هستید'}
              </div>
            </div>

            {!isOnline && offlineOrders.length > 0 && (
              <p className="text-muted text-sm">
                {offlineOrders.length} سفارش در صف ارسال قرار دارد و پس از اتصال به اینترنت به صورت
                خودکار ارسال می‌شود.
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
                    <SelectItem key={option.value} textValue={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
                <Button size="sm" variant="flat" onPress={() => void loadOnlineOrders()}>
                  بروزرسانی
                </Button>
                {onlineOrders.length > 0 && (
                  <p className="text-xs text-muted w-full sm:w-auto">
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
                    <h2 className="text-lg font-semibold text-foreground">
                      سفارشات آفلاین (در انتظار ارسال)
                    </h2>
                    {renderOfflineOrders()}
                  </>
                )}
                {onlineOrders.length > 0 && (
                  <>
                    <h2 className="text-lg font-semibold text-foreground mt-4">
                      آخرین سفارشات بارگذاری‌شده
                      <span className="text-sm font-normal text-muted mr-2">
                        (نمایش کش — ممکن است به‌روز نباشند)
                      </span>
                    </h2>
                    {renderOnlineOrders()}
                  </>
                )}
                {offlineOrders.length === 0 && onlineOrders.length === 0 && (
                  <div className="py-12 text-center text-muted">سفارشی برای نمایش وجود ندارد.</div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <OrderPreviewModal
        previewVisible={previewVisible}
        closePreview={closePreview}
        previewTitle={previewTitle}
        enabledPrinters={enabledPrinters}
        previewPrinterName={previewPrinterName}
        handlePreviewPrinterChange={handlePreviewPrinterChange}
        previewLoading={previewLoading}
        previewImage={previewImage}
        previewHtml={previewHtml}
      />

      <OrderReprintModal
        reprintModalOpen={reprintModalOpen}
        setReprintModalOpen={setReprintModalOpen}
        reprintOrder={reprintOrder}
        reprintIsOffline={reprintIsOffline}
        enabledPrinters={enabledPrinters}
        reprintSelectedPrinters={reprintSelectedPrinters}
        setReprintSelectedPrinters={setReprintSelectedPrinters}
        doReprint={doReprint}
        reprintLoading={reprintLoading}
      />

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
      <CreditPayModal
        creditPayModalOpen={creditPayModalOpen}
        setCreditPayModalOpen={setCreditPayModalOpen}
        creditPayOrder={creditPayOrder}
        creditPayAmount={creditPayAmount}
        setCreditPayAmount={setCreditPayAmount}
        creditPayMethod={creditPayMethod}
        setCreditPayMethod={setCreditPayMethod}
        cashBankAccounts={cashBankAccounts}
        creditPayAccountId={creditPayAccountId}
        setCreditPayAccountId={setCreditPayAccountId}
        creditPayNotes={creditPayNotes}
        setCreditPayNotes={setCreditPayNotes}
        creditPaySaving={creditPaySaving}
        handleCreditPay={handleCreditPay}
      />
    </div>
  );
}
