import { useState, useEffect } from 'react';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
import { SwitchCompat as Switch } from '../ui/compat-switch';
import { useAuthStore } from '../store/authStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { useThemeStore } from '../store/themeStore';
import { useCatalogDisplayStore } from '../store/catalogDisplayStore';
import {
  getReceiptNumberSettingsFromServer,
  getPrintTemplates,
  type PrintTemplateItem,
  WEB_PANEL_URL,
} from '../services/api';
import { printTemplateKey, resolveTemplateForPrinter } from '../utils/printTemplates';
import { useSyncStore } from '../store/syncStore';
import { toast } from '../utils/toast';
import { useNavigate } from 'react-router-dom';
import { canManageHardwareSettings } from '../lib/electronPermissions';
import { PrinterSettingsCard } from './settings/PrinterSettingsCard';
import { ScaleSettingsCard } from './settings/ScaleSettingsCard';
import { CallerIdSettingsCard } from './settings/CallerIdSettingsCard';
import { useCallerIdSettings } from './settings/useCallerIdSettings';
import { useScaleSettings } from './settings/useScaleSettings';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const canManageHw = canManageHardwareSettings(user);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<
    Array<{ name: string; displayName?: string; description?: string }>
  >([]);
  const [printTemplates, setPrintTemplates] = useState<PrintTemplateItem[]>([]);
  const [printerTemplatesMap, setPrinterTemplatesMap] = useState<
    Record<
      string,
      {
        id: number;
        name: string;
        paperWidth: number;
        paperLength: number;
        margin: number;
        layout?: unknown;
      } | null
    >
  >({});
  const [defaultTemplate, setDefaultTemplate] = useState<{ id: number; name: string } | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplateForPrinter, setSavingTemplateForPrinter] = useState<string | null>(null);
  const {
    configs,
    autoPrintOnNewOrder,
    setPrinterEnabled,
    updatePrinterConfig,
    setReceiptEnabled,
    setReceiptCopies,
    setAutoPrintOnNewOrder,
    getPrinterReceipts,
    loadFromStorage,
  } = usePrinterSettingsStore();
  const { theme, setTheme } = useThemeStore();
  const { showProductImages, setShowProductImages } = useCatalogDisplayStore();
  const [dataDir, setDataDir] = useState<{
    userData: string;
    files: Record<string, string>;
  } | null>(null);
  const {
    isOnline: accountingOnline,
    isSyncing: accountingSyncing,
    pendingOps: accountingPendingOps,
    failedOps: accountingFailedOps,
    lastSyncedAt: accountingLastSyncedAt,
    lastError: accountingLastError,
  } = useSyncStore();

  const {
    scaleConnectionType,
    setScaleConnectionType,
    scalePortName,
    setScalePortName,
    scaleBaudRate,
    setScaleBaudRate,
    scaleHost,
    setScaleHost,
    scaleTcpPort,
    setScaleTcpPort,
    scalePorts,
    scaleConnected,
    scaleConnecting,
    scaleSaving,
    loadScaleData,
    handleScaleSave,
    handleScaleConnect,
    handleScaleDisconnect,
    handleRefreshPorts,
  } = useScaleSettings();

  const [posWarehouseId, setPosWarehouseId] = useState<number | null>(null);
  const [posWarehouseList, setPosWarehouseList] = useState<
    Array<{ id: number; name: string; isDefault: boolean }>
  >([]);
  const [posWarehouseSaving, setPosWarehouseSaving] = useState(false);

  const {
    callerIdEnabled,
    setCallerIdEnabled,
    callerIdMode,
    setCallerIdMode,
    callerIdPort,
    setCallerIdPort,
    callerIdSecret,
    setCallerIdSecret,
    callerIdPhoneField,
    setCallerIdPhoneField,
    callerIdSerialPort,
    setCallerIdSerialPort,
    callerIdSerialBaud,
    setCallerIdSerialBaud,
    callerIdSerialFormat,
    setCallerIdSerialFormat,
    callerIdSerialPorts,
    callerIdSerialConnected,
    callerIdSerialConnecting,
    callerIdHidConnected,
    callerIdHidConnecting,
    callerIdHidDeviceFound,
    callerIdDuration,
    setCallerIdDuration,
    callerIdSound,
    setCallerIdSound,
    callerIdSaving,
    callerIdWebhookRunning,
    loadCallerIdData,
    handleCallerIdSerialRefreshPorts,
    handleCallerIdSerialConnect,
    handleCallerIdSerialDisconnect,
    handleCallerIdHidCheckDevice,
    handleCallerIdHidConnect,
    handleCallerIdHidDisconnect,
    handleCallerIdSave,
  } = useCallerIdSettings();

  useEffect(() => {
    window.electronAPI
      ?.getDataDir?.()
      .then(setDataDir)
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadFromStorage();
    loadPrinters();
    loadScaleData();
    loadCallerIdData();
    loadPosWarehouseData();
  }, []);

  const loadPosWarehouseData = async () => {
    const api = window.electronAPI;
    if (!api?.getPosWarehouseId) return;
    try {
      const { listWarehousesLocal } = await import('../services/accountingLocalDb');
      const restaurantId = useAuthStore.getState().user?.restaurants?.[0]?.id;
      const [savedId, warehouses] = await Promise.all([
        api.getPosWarehouseId(),
        restaurantId ? listWarehousesLocal(restaurantId) : Promise.resolve([]),
      ]);
      setPosWarehouseId(savedId ?? null);
      setPosWarehouseList(
        (warehouses as any[]).map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault })),
      );
    } catch {
      // ignore
    }
  };

  const handlePosWarehouseSave = async () => {
    const api = window.electronAPI;
    if (!api?.savePosWarehouseId) return;
    setPosWarehouseSaving(true);
    try {
      await api.savePosWarehouseId(posWarehouseId);
      toast.success('انبار پایانه ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره انبار پایانه');
    } finally {
      setPosWarehouseSaving(false);
    }
  };

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateNotAvailable || !api?.onUpdateAvailable) return;
    const unsubNa = api.onUpdateNotAvailable(() => toast.info('شما آخرین نسخه را دارید.'));
    const unsubAv = api.onUpdateAvailable(() => {});
    return () => {
      unsubNa?.();
      unsubAv?.();
    };
  }, []);

  useEffect(() => {
    const loadTemplatesAndPerPrinter = async () => {
      const restaurantId = user?.restaurants?.[0]?.id;
      if (!token || !restaurantId) return;
      setLoadingTemplates(true);
      try {
        const list = await getPrintTemplates(restaurantId, token);
        // قبل از خواندن نگاشتِ محلی، اسنپ‌شات‌های ذخیره‌شده‌ای که قالب‌شان از این پس
        // تغییر کرده (مثلاً عکس لوگو عوض شده) را با آخرین محتوای سرور به‌روز می‌کنیم؛
        // وگرنه این صفحه هم مثل چاپ، نسخهٔ قدیمیِ کش‌شده را نشان می‌دهد.
        if (list.length > 0) {
          await window.electronAPI?.refreshCachedPrintTemplates?.(list);
        }
        const [map, fallback] = await Promise.all([
          window.electronAPI?.getPrintTemplatesMap?.() ?? Promise.resolve({}),
          window.electronAPI?.getDefaultPrintTemplate?.() ?? Promise.resolve(null),
        ]);
        setPrintTemplates(list);
        setPrinterTemplatesMap(map ?? {});
        setDefaultTemplate(fallback ?? null);
      } catch {
        setPrintTemplates([]);
        setPrinterTemplatesMap({});
        setDefaultTemplate(null);
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplatesAndPerPrinter();
  }, [token, user?.restaurants?.[0]?.id]);

  /**
   * انتخاب قالب برای یک پرینتر (receiptType نداشته باشد) یا برای یک رسید مشخص از
   * آن پرینتر. مقدار `inherit` یعنی از سطح بالاتر ارث ببرد و `none` یعنی بدون قالب.
   *
   * بعد از ذخیره، نگاشت از خود لایهٔ الکترون دوباره خوانده می‌شود (نه به‌روزرسانی
   * خوش‌بینانه) تا اگر نوشتن انجام نشده باشد، به‌جای برگشتن بی‌صدای انتخاب، خطا دیده شود.
   */
  const handlePrinterTemplateChange = async (
    printerName: string,
    templateId: string | null,
    receiptType?: 'full' | 'kitchen',
  ) => {
    if (!window.electronAPI?.setPrintTemplateForPrinter) {
      toast.error('دسترسی به تنظیمات برنامه برقرار نیست؛ برنامه را دوباره باز کنید.');
      return;
    }
    const key = printTemplateKey(printerName, receiptType);
    setSavingTemplateForPrinter(key);
    const save = async (template: unknown) => {
      const res = await window.electronAPI!.setPrintTemplateForPrinter(
        printerName,
        template,
        receiptType,
      );
      if (res && res.success === false) {
        toast.error(`ذخیرهٔ قالب ناموفق بود: ${res.error ?? 'خطای نامشخص'}`);
      }
    };
    try {
      let expectedId: number | null | undefined;
      if (templateId === 'inherit') {
        await save(undefined);
        expectedId = undefined;
      } else if (!templateId || templateId === '') {
        await save(null);
        expectedId = null;
      } else {
        const id = parseInt(templateId, 10);
        const t = printTemplates.find((x) => x.id === id);
        if (!t) {
          toast.error('قالب انتخاب‌شده پیدا نشد. لیست قالب‌ها را دوباره بارگذاری کنید.');
          return;
        }
        const snapshot = {
          id: t.id,
          name: t.name,
          receiptType: t.receiptType,
          paperWidth: t.paperWidth,
          paperLength: t.paperLength,
          margin: t.margin,
          contentWidthMm: t.contentWidthMm,
          shiftLeftMm: t.shiftLeftMm,
          layout: t.layout,
        };
        await save(snapshot);
        if (!receiptType) {
          // قالبِ سطح پرینتر به‌عنوان قالب پیش‌فرض برنامه هم ذخیره می‌شود تا
          // پرینترهایی که انتخاب صریحی ندارند با همین قالب چاپ کنند.
          await window.electronAPI.setDefaultPrintTemplate?.(snapshot);
          setDefaultTemplate(snapshot);
        }
        expectedId = t.id;
      }

      const saved = (await window.electronAPI.getPrintTemplatesMap?.()) ?? {};
      setPrinterTemplatesMap(saved);

      const hasKey = Object.prototype.hasOwnProperty.call(saved, key);
      const actualId = hasKey ? (saved[key]?.id ?? null) : undefined;
      if (actualId !== expectedId) {
        toast.error(
          receiptType
            ? 'ذخیرهٔ قالب این رسید انجام نشد. برنامه را کامل ببندید و دوباره باز کنید (نسخهٔ در حال اجرا قدیمی است).'
            : 'ذخیرهٔ قالب این پرینتر انجام نشد.',
        );
      }
    } finally {
      setSavingTemplateForPrinter(null);
    }
  };

  /** کلیدِ Select یک رسید: انتخاب صریح خودش، وگرنه «ارث‌بری» */
  const receiptTemplateValue = (printerName: string, receiptType: 'full' | 'kitchen') => {
    const key = printTemplateKey(printerName, receiptType);
    if (!Object.prototype.hasOwnProperty.call(printerTemplatesMap, key)) return 'inherit';
    return printerTemplatesMap[key] ? String(printerTemplatesMap[key]!.id) : 'none';
  };

  /** قالبی که واقعاً برای این رسید چاپ می‌شود (بعد از ارث‌بری) */
  const effectiveReceiptTemplateName = (printerName: string, receiptType: 'full' | 'kitchen') =>
    resolveTemplateForPrinter(printerName, printerTemplatesMap, defaultTemplate, receiptType)
      ?.name ?? 'قالب پیش‌فرض برنامه';

  useEffect(() => {
    const sync = async () => {
      const restaurantId = user?.restaurants?.[0]?.id;
      if (
        !token ||
        !restaurantId ||
        !window.electronAPI?.getReceiptNumberSettings ||
        !window.electronAPI?.saveReceiptNumberSettings
      )
        return;
      try {
        const [local, server] = await Promise.all([
          window.electronAPI.getReceiptNumberSettings(),
          getReceiptNumberSettingsFromServer(restaurantId, token),
        ]);
        if (server && local) {
          const dailyResetTime =
            server.dailyResetTime && /^\d{1,2}:\d{2}$/.test(server.dailyResetTime)
              ? server.dailyResetTime
              : '00:00';
          const mergedNextNumber = Math.max(
            1,
            Number(local.nextNumber) || 1,
            Number(server.nextNumber) || 1,
          );
          const mergedStartNumber = Math.max(1, Number(server.startNumber) || 1);
          await window.electronAPI.saveReceiptNumberSettings({
            // اگر سمت سرور شماره بزرگ‌تری تنظیم شده باشد، روی دسکتاپ هم اعمال شود
            nextNumber: mergedNextNumber,
            lastResetDate:
              typeof server.lastResetDate === 'string'
                ? server.lastResetDate
                : (local.lastResetDate ?? ''),
            resetPolicy: server.resetPolicy,
            startNumber: mergedStartNumber,
            dailyResetTime,
          });
        }
      } catch {
        /* ignore */
      }
    };
    sync();
  }, [token, user?.restaurants?.[0]?.id]);

  const checkOnlineStatus = async () => {
    if (window.electronAPI) {
      const online = await window.electronAPI.checkOnline();
      setIsOnline(online);
    } else {
      setIsOnline(navigator.onLine);
    }
  };

  const handleOpenWebPanel = async () => {
    if (!window.electronAPI?.openExternal) {
      toast.warning('این قابلیت فقط در Electron در دسترس است');
      return;
    }
    const result = await window.electronAPI.openExternal(WEB_PANEL_URL);
    if (!result.success) {
      toast.error('خطا در باز کردن پنل وب');
    }
  };

  const handleSync = async () => {
    if (!window.electronAPI) {
      toast.warning('این قابلیت فقط در Electron در دسترس است');
      return;
    }
    if (!token) {
      toast.warning('برای ارسال سفارشات ابتدا وارد شوید.');
      return;
    }
    try {
      const result = await window.electronAPI.syncOrders(token);
      toast.success(`همگام‌سازی انجام شد: ${result.success} موفق، ${result.failed} ناموفق`);
    } catch (err: unknown) {
      toast.error(`خطا در همگام‌سازی: ${err instanceof Error ? err.message : 'نامشخص'}`);
    }
  };

  const loadPrinters = async () => {
    if (!window.electronAPI) return;
    setIsLoadingPrinters(true);
    try {
      const printers = await window.electronAPI.getPrinters();
      setAvailablePrinters(printers);
    } catch (err: unknown) {
      console.error('Printer load error:', err);
      toast.error(err instanceof Error ? err.message : 'خطا در دریافت لیست پرینترها');
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="shrink-0 bg-surface border-b border-border px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold text-foreground">تنظیمات</h1>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
              اطلاعات کاربر
            </h2>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted">نام:</span>
              <span>
                {user?.firstName} {user?.lastName}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted">موبایل:</span>
              <span>{user?.mobile}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted">رستوران:</span>
              <span>
                {user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || 'تعیین نشده'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
              پنل وب
            </h2>
            <p className="text-sm text-muted">
              برای دسترسی به گزارش‌ها و تنظیمات کامل، پنل مدیریت وب را در مرورگر باز کنید.
            </p>
            <Button color="primary" onPress={handleOpenWebPanel} className="w-full">
              باز کردن پنل وب (داشبورد)
            </Button>
          </CardContent>
        </Card>

        {window.electronAPI?.saveCardTerminalConfig && (
          <Card>
            <CardContent className="gap-3">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
                کارتخوان‌ها
              </h2>
              <p className="text-sm text-muted">
                مدیریت، افزودن و ویرایش کارتخوان‌ها از صفحه اختصاصی انجام می‌شود.
              </p>
              <Button
                variant="flat"
                color="primary"
                size="sm"
                onPress={() => navigate('/card-terminals')}
              >
                رفتن به مدیریت کارتخوان‌ها ←
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
              ظاهر
            </h2>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted">حالت تاریک (دارک)</span>
              <Switch
                isSelected={theme === 'dark'}
                onValueChange={(isDark) => setTheme(isDark ? 'dark' : 'light')}
                aria-label="حالت تاریک"
              />
            </div>
            <div className="flex justify-between items-center py-2">
              <div className="flex flex-col">
                <span className="text-foreground">نمایش عکس محصولات</span>
                <span className="text-muted text-xs">
                  در گرید ثبت سفارش و سبد خرید — غیرفعال کردن، صفحه را فشرده‌تر و سریع‌تر می‌کند.
                </span>
              </div>
              <Switch
                isSelected={showProductImages}
                onValueChange={setShowProductImages}
                aria-label="نمایش عکس محصولات"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
              وضعیت اتصال
            </h2>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted">وضعیت:</span>
              <span className={isOnline ? 'text-success font-bold' : 'text-danger font-bold'}>
                {isOnline ? 'آنلاین' : 'آفلاین'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
              همگام‌سازی
            </h2>
            <Button color="primary" onPress={handleSync} className="w-full">
              همگام‌سازی سفارشات آفلاین
            </Button>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-default-soft p-2">
                آنلاین: {accountingOnline ? 'بله' : 'خیر'}
              </div>
              <div className="rounded-lg bg-default-soft p-2">
                در حال سینک: {accountingSyncing ? 'بله' : 'خیر'}
              </div>
              <div className="rounded-lg bg-default-soft p-2">
                عملیات صف: {accountingPendingOps}
              </div>
              <div className="rounded-lg bg-default-soft p-2">ناموفق: {accountingFailedOps}</div>
            </div>
            {accountingLastSyncedAt ? (
              <p className="text-xs text-muted">
                آخرین سینک حسابداری: {new Date(accountingLastSyncedAt).toLocaleString('fa-IR')}
              </p>
            ) : null}
            {accountingLastError ? (
              <p className="text-xs text-danger">خطای سینک حسابداری: {accountingLastError}</p>
            ) : null}
          </CardContent>
        </Card>

        {window.electronAPI?.checkForUpdates && (
          <Card>
            <CardContent className="gap-3">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
                بروزرسانی برنامه
              </h2>
              <p className="text-muted text-sm">
                در صورت وجود نسخه جدید، بنر بروزرسانی در بالای صفحه نمایش داده می‌شود.
              </p>
              <Button
                color="primary"
                variant="flat"
                onPress={() => {
                  void (async () => {
                    try {
                      const result = await window.electronAPI?.checkForUpdates?.();
                      if (result && 'ok' in result && !result.ok && result.message) {
                        toast.error(result.message);
                      }
                    } catch {
                      toast.error('خطا در درخواست بررسی بروزرسانی.');
                    }
                  })();
                }}
              >
                بررسی بروزرسانی
              </Button>
            </CardContent>
          </Card>
        )}

        <PrinterSettingsCard
          loadPrinters={loadPrinters}
          autoPrintOnNewOrder={autoPrintOnNewOrder}
          setAutoPrintOnNewOrder={setAutoPrintOnNewOrder}
          isLoadingPrinters={isLoadingPrinters}
          availablePrinters={availablePrinters}
          configs={configs}
          getPrinterReceipts={getPrinterReceipts}
          printerTemplatesMap={printerTemplatesMap}
          defaultTemplate={defaultTemplate}
          setPrinterEnabled={setPrinterEnabled}
          loadingTemplates={loadingTemplates}
          handlePrinterTemplateChange={handlePrinterTemplateChange}
          savingTemplateForPrinter={savingTemplateForPrinter}
          printTemplates={printTemplates}
          updatePrinterConfig={updatePrinterConfig}
          setReceiptEnabled={setReceiptEnabled}
          setReceiptCopies={setReceiptCopies}
          receiptTemplateValue={receiptTemplateValue}
          effectiveReceiptTemplateName={effectiveReceiptTemplateName}
        />

        {/* مسیر ذخیره‌سازی داده‌ها */}
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h3 className="font-semibold text-foreground/80 text-sm">
              مسیر ذخیره‌سازی داده‌های برنامه
            </h3>
            {dataDir ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-muted text-xs">پوشه داده‌ها (userData):</span>
                  <code
                    dir="ltr"
                    className="block text-xs bg-default-soft px-2 py-1.5 rounded-lg break-all text-foreground/80 select-all"
                  >
                    {dataDir.userData}
                  </code>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  {Object.entries(dataDir.files).map(([label, filePath]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-muted text-xs">{label}:</span>
                      <code
                        dir="ltr"
                        className="block text-xs bg-default-soft px-2 py-1.5 rounded-lg break-all text-muted select-all"
                      >
                        {filePath}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted text-xs">در حال بارگذاری...</p>
            )}
          </CardContent>
        </Card>

        {window.electronAPI?.scaleLoadSettings && canManageHw && (
          <ScaleSettingsCard
            scaleConnected={scaleConnected}
            scaleConnectionType={scaleConnectionType}
            setScaleConnectionType={setScaleConnectionType}
            scalePortName={scalePortName}
            setScalePortName={setScalePortName}
            scalePorts={scalePorts}
            handleRefreshPorts={handleRefreshPorts}
            scaleBaudRate={scaleBaudRate}
            setScaleBaudRate={setScaleBaudRate}
            scaleHost={scaleHost}
            setScaleHost={setScaleHost}
            scaleTcpPort={scaleTcpPort}
            setScaleTcpPort={setScaleTcpPort}
            scaleSaving={scaleSaving}
            handleScaleSave={handleScaleSave}
            handleScaleDisconnect={handleScaleDisconnect}
            scaleConnecting={scaleConnecting}
            handleScaleConnect={handleScaleConnect}
          />
        )}

        {/* Caller ID Settings */}
        {window.electronAPI?.getCallerIdSettings && canManageHw && (
          <CallerIdSettingsCard
            callerIdEnabled={callerIdEnabled}
            setCallerIdEnabled={setCallerIdEnabled}
            callerIdMode={callerIdMode}
            setCallerIdMode={setCallerIdMode}
            callerIdPort={callerIdPort}
            setCallerIdPort={setCallerIdPort}
            callerIdPhoneField={callerIdPhoneField}
            setCallerIdPhoneField={setCallerIdPhoneField}
            callerIdSecret={callerIdSecret}
            setCallerIdSecret={setCallerIdSecret}
            callerIdWebhookRunning={callerIdWebhookRunning}
            callerIdSerialPort={callerIdSerialPort}
            setCallerIdSerialPort={setCallerIdSerialPort}
            callerIdSerialPorts={callerIdSerialPorts}
            handleCallerIdSerialRefreshPorts={handleCallerIdSerialRefreshPorts}
            callerIdSerialBaud={callerIdSerialBaud}
            setCallerIdSerialBaud={setCallerIdSerialBaud}
            callerIdSerialFormat={callerIdSerialFormat}
            setCallerIdSerialFormat={setCallerIdSerialFormat}
            callerIdSerialConnected={callerIdSerialConnected}
            handleCallerIdSerialDisconnect={handleCallerIdSerialDisconnect}
            callerIdSerialConnecting={callerIdSerialConnecting}
            handleCallerIdSerialConnect={handleCallerIdSerialConnect}
            callerIdHidDeviceFound={callerIdHidDeviceFound}
            callerIdHidConnected={callerIdHidConnected}
            handleCallerIdHidCheckDevice={handleCallerIdHidCheckDevice}
            handleCallerIdHidDisconnect={handleCallerIdHidDisconnect}
            callerIdHidConnecting={callerIdHidConnecting}
            handleCallerIdHidConnect={handleCallerIdHidConnect}
            callerIdDuration={callerIdDuration}
            setCallerIdDuration={setCallerIdDuration}
            callerIdSound={callerIdSound}
            setCallerIdSound={setCallerIdSound}
            callerIdSaving={callerIdSaving}
            handleCallerIdSave={handleCallerIdSave}
          />
        )}

        {window.electronAPI?.getPosWarehouseId && posWarehouseList.length > 1 && (
          <Card>
            <CardContent>
              <h3 className="font-semibold mb-3">انبار پایانه POS</h3>
              <p className="text-sm text-muted mb-3">
                موجودی فروش از این انبار کسر می‌شود. اگر تنظیم نشود، انبار پیش‌فرض استفاده می‌شود.
              </p>
              <Select
                label="انبار"
                selectedKeys={posWarehouseId ? [String(posWarehouseId)] : ['0']}
                onSelectionChange={(keys) => {
                  const val = Number([...keys][0]);
                  setPosWarehouseId(val > 0 ? val : null);
                }}
              >
                <SelectItem key="0">انبار پیش‌فرض (خودکار)</SelectItem>
                {posWarehouseList.map((w) => (
                  <SelectItem key={String(w.id)}>
                    {w.name}
                    {w.isDefault ? ' (پیش‌فرض)' : ''}
                  </SelectItem>
                ))}
              </Select>
              <Button
                size="sm"
                variant="flat"
                className="mt-3"
                isLoading={posWarehouseSaving}
                onPress={handlePosWarehouseSave}
              >
                ذخیره انبار پایانه
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Button color="danger" variant="flat" className="w-full" onPress={logout}>
              خروج از حساب کاربری
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
