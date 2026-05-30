import { useState, useEffect } from 'react';
import { Card, CardContent, Tab, TabList, TabListContainer, Tabs } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { Select, SelectItem } from '../ui/compat-select';
import { CheckboxCompat as Checkbox } from '../ui/compat-checkbox';
import { SwitchCompat as Switch } from '../ui/compat-switch';
import { useAuthStore } from '../store/authStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { useThemeStore } from '../store/themeStore';
import { getReceiptNumberSettingsFromServer, getPrintTemplates, type PrintTemplateItem } from '../services/api';
import { useSyncStore } from '../store/syncStore';
import { toast } from '../utils/toast';
import { useNavigate } from 'react-router-dom';
import { canManageHardwareSettings, getPrimaryRestaurantId } from '../lib/electronPermissions';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const canManageHw = canManageHardwareSettings(user);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<Array<{ name: string; displayName?: string; description?: string }>>([]);
  const [printTemplates, setPrintTemplates] = useState<PrintTemplateItem[]>([]);
  const [printerTemplatesMap, setPrinterTemplatesMap] = useState<Record<string, { id: number; name: string; paperWidth: number; paperLength: number; margin: number; layout?: unknown } | null>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplateForPrinter, setSavingTemplateForPrinter] = useState<string | null>(null);
  const {
    configs,
    setPrinterEnabled,
    updatePrinterConfig,
    setReceiptEnabled,
    setReceiptCopies,
    getPrinterReceipts,
    loadFromStorage,
  } = usePrinterSettingsStore();
  const { theme, setTheme } = useThemeStore();
  const [receiptPriceUnit, setReceiptPriceUnit] = useState<'toman' | 'rial'>('toman');
  const [dataDir, setDataDir] = useState<{ userData: string; files: Record<string, string> } | null>(null);
  const {
    isOnline: accountingOnline,
    isSyncing: accountingSyncing,
    pendingOps: accountingPendingOps,
    failedOps: accountingFailedOps,
    lastSyncedAt: accountingLastSyncedAt,
    lastError: accountingLastError,
  } = useSyncStore();

  const [scaleConnectionType, setScaleConnectionType] = useState<'serial' | 'tcp'>('serial');
  const [scalePortName, setScalePortName] = useState('');
  const [scaleBaudRate, setScaleBaudRate] = useState('9600');
  const [scaleHost, setScaleHost] = useState('');
  const [scaleTcpPort, setScaleTcpPort] = useState('8000');
  const [scalePorts, setScalePorts] = useState<Array<{ path: string; manufacturer?: string; friendlyName?: string }>>([]);
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleConnecting, setScaleConnecting] = useState(false);
  const [scaleSaving, setScaleSaving] = useState(false);

  const [posWarehouseId, setPosWarehouseId] = useState<number | null>(null);
  const [posWarehouseList, setPosWarehouseList] = useState<Array<{ id: number; name: string; isDefault: boolean }>>([]);
  const [posWarehouseSaving, setPosWarehouseSaving] = useState(false);

  const [callerIdEnabled, setCallerIdEnabled] = useState(false);
  const [callerIdMode, setCallerIdMode] = useState<'webhook' | 'serial' | 'hid'>('webhook');
  // webhook
  const [callerIdPort, setCallerIdPort] = useState('5055');
  const [callerIdSecret, setCallerIdSecret] = useState('');
  const [callerIdPhoneField, setCallerIdPhoneField] = useState('caller');
  // serial / USB
  const [callerIdSerialPort, setCallerIdSerialPort] = useState('');
  const [callerIdSerialBaud, setCallerIdSerialBaud] = useState('9600');
  const [callerIdSerialFormat, setCallerIdSerialFormat] = useState('auto');
  const [callerIdSerialPorts, setCallerIdSerialPorts] = useState<Array<{ path: string; manufacturer?: string; friendlyName?: string }>>([]);
  const [callerIdSerialConnected, setCallerIdSerialConnected] = useState(false);
  const [callerIdSerialConnecting, setCallerIdSerialConnecting] = useState(false);
  // HID (T-Line TK-202UH)
  const [callerIdHidConnected, setCallerIdHidConnected] = useState(false);
  const [callerIdHidConnecting, setCallerIdHidConnecting] = useState(false);
  const [callerIdHidDeviceFound, setCallerIdHidDeviceFound] = useState(false);
  // common
  const [callerIdDuration, setCallerIdDuration] = useState('30');
  const [callerIdSound, setCallerIdSound] = useState(true);
  const [callerIdSaving, setCallerIdSaving] = useState(false);
  const [callerIdWebhookRunning, setCallerIdWebhookRunning] = useState(false);

  useEffect(() => {
    window.electronAPI?.getDataDir?.().then(setDataDir).catch(() => {});
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

  const loadCallerIdData = async () => {
    const api = window.electronAPI;
    if (!api?.getCallerIdSettings) return;
    try {
      const [s, status, serialStatus, ports, hidStatus, hidDevices] = await Promise.all([
        api.getCallerIdSettings(),
        api.getCallerIdWebhookStatus?.() ?? Promise.resolve({ running: false, port: null }),
        api.callerIdSerialStatus?.() ?? Promise.resolve({ connected: false }),
        api.callerIdSerialListPorts?.() ?? Promise.resolve([]),
        api.callerIdHidStatus?.() ?? Promise.resolve({ connected: false }),
        api.callerIdHidListDevices?.() ?? Promise.resolve([]),
      ]);
      setCallerIdEnabled(Boolean(s.enabled));
      setCallerIdMode(s.inputMode === 'serial' ? 'serial' : s.inputMode === 'hid' ? 'hid' : 'webhook');
      setCallerIdHidConnected(Boolean(hidStatus?.connected));
      setCallerIdHidDeviceFound(Array.isArray(hidDevices) && hidDevices.length > 0);
      setCallerIdPort(String(s.webhookPort || 5055));
      setCallerIdSecret(String(s.webhookSecret || ''));
      setCallerIdPhoneField(String(s.phoneField || 'caller'));
      setCallerIdSerialPort(String(s.serialPortName || ''));
      setCallerIdSerialBaud(String(s.serialBaudRate || 9600));
      setCallerIdSerialFormat(String(s.serialFormat || 'auto'));
      setCallerIdDuration(String(s.notifyDurationSec || 30));
      setCallerIdSound(s.playSoundEnabled !== false);
      setCallerIdWebhookRunning(Boolean(status?.running));
      setCallerIdSerialConnected(Boolean(serialStatus?.connected));
      setCallerIdSerialPorts(ports ?? []);
    } catch {}
  };

  const handleCallerIdSerialRefreshPorts = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdSerialListPorts) return;
    try {
      const ports = await api.callerIdSerialListPorts();
      setCallerIdSerialPorts(ports ?? []);
      if (!ports?.length) toast.info('دستگاه USB یافت نشد');
    } catch { toast.error('خطا در خواندن پورت‌ها'); }
  };

  const handleCallerIdSerialConnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdSerialConnect) return;
    setCallerIdSerialConnecting(true);
    try {
      const result = await api.callerIdSerialConnect({
        enabled: true,
        portName: callerIdSerialPort,
        baudRate: Number(callerIdSerialBaud) || 9600,
        format: callerIdSerialFormat,
      });
      if (result.success) {
        setCallerIdSerialConnected(true);
        toast.success('دستگاه Caller ID متصل شد');
      } else {
        toast.error(`خطا: ${result.error || 'اتصال ناموفق'}`);
      }
    } catch { toast.error('خطا در اتصال به دستگاه'); }
    finally { setCallerIdSerialConnecting(false); }
  };

  const handleCallerIdSerialDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdSerialDisconnect) return;
    try {
      await api.callerIdSerialDisconnect();
      setCallerIdSerialConnected(false);
      toast.info('دستگاه Caller ID قطع شد');
    } catch { toast.error('خطا در قطع اتصال'); }
  };

  // ── HID handlers ────────────────────────────────────────────────────────────
  const handleCallerIdHidCheckDevice = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdHidListDevices) return;
    try {
      const devices = await api.callerIdHidListDevices();
      const found = Array.isArray(devices) && devices.length > 0;
      setCallerIdHidDeviceFound(found);
      if (found) toast.success('دستگاه T-Line TK-202UH پیدا شد!');
      else toast.info('دستگاه T-Line یافت نشد — USB را چک کنید');
    } catch { toast.error('خطا در جستجوی دستگاه'); }
  };

  const handleCallerIdHidConnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdHidConnect) return;
    setCallerIdHidConnecting(true);
    try {
      const result = await api.callerIdHidConnect();
      if (result.success) {
        setCallerIdHidConnected(true);
        toast.success('دستگاه T-Line TK-202UH متصل شد — در انتظار تماس...');
      } else {
        toast.error(`خطا: ${result.error || 'اتصال ناموفق'}`);
      }
    } catch { toast.error('خطا در اتصال به دستگاه HID'); }
    finally { setCallerIdHidConnecting(false); }
  };

  const handleCallerIdHidDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdHidDisconnect) return;
    try {
      await api.callerIdHidDisconnect();
      setCallerIdHidConnected(false);
      toast.info('دستگاه T-Line قطع شد');
    } catch { toast.error('خطا در قطع اتصال'); }
  };

  const handleCallerIdSave = async () => {
    const api = window.electronAPI;
    if (!api?.saveCallerIdSettings) return;
    setCallerIdSaving(true);
    try {
      await api.saveCallerIdSettings({
        enabled: callerIdEnabled,
        inputMode: callerIdMode,
        webhookPort: Number(callerIdPort) || 5055,
        webhookSecret: callerIdSecret,
        phoneField: callerIdPhoneField || 'caller',
        serialPortName: callerIdSerialPort,
        serialBaudRate: Number(callerIdSerialBaud) || 9600,
        serialFormat: callerIdSerialFormat,
        notifyDurationSec: Number(callerIdDuration) || 30,
        playSoundEnabled: callerIdSound,
      });
      const status = await api.getCallerIdWebhookStatus?.();
      setCallerIdWebhookRunning(Boolean(status?.running));
      const serialStatus = await api.callerIdSerialStatus?.();
      setCallerIdSerialConnected(Boolean(serialStatus?.connected));
      toast.success('تنظیمات Caller ID ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره تنظیمات Caller ID');
    } finally {
      setCallerIdSaving(false);
    }
  };

  const loadScaleData = async () => {
    const api = window.electronAPI;
    if (!api?.scaleLoadSettings) return;
    try {
      const [settings, status, ports] = await Promise.all([
        api.scaleLoadSettings(),
        api.scaleStatus?.() ?? Promise.resolve({ connected: false, latestWeight: null }),
        api.scaleListPorts?.() ?? Promise.resolve([]),
      ]);
      if (settings) {
        setScaleConnectionType(settings.connectionType === 'tcp' ? 'tcp' : 'serial');
        setScalePortName(settings.portName || '');
        setScaleBaudRate(String(settings.baudRate || 9600));
        setScaleHost(settings.host || '');
        setScaleTcpPort(String(settings.tcpPort || 8000));
      }
      setScaleConnected(status?.connected ?? false);
      setScalePorts(ports ?? []);
    } catch {}
  };

  const handleScaleSave = async () => {
    const api = window.electronAPI;
    if (!api?.scaleSaveSettings) return;
    setScaleSaving(true);
    try {
      await api.scaleSaveSettings({
        connectionType: scaleConnectionType,
        portName: scalePortName,
        baudRate: Number(scaleBaudRate) || 9600,
        host: scaleHost,
        tcpPort: Number(scaleTcpPort) || 8000,
      });
      toast.success('تنظیمات ترازو ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره تنظیمات ترازو');
    } finally {
      setScaleSaving(false);
    }
  };

  const handleScaleConnect = async () => {
    const api = window.electronAPI;
    if (!api?.scaleConnect) return;
    setScaleConnecting(true);
    try {
      await api.scaleSaveSettings?.({
        connectionType: scaleConnectionType,
        portName: scalePortName,
        baudRate: Number(scaleBaudRate) || 9600,
        host: scaleHost,
        tcpPort: Number(scaleTcpPort) || 8000,
      });
      const result = await api.scaleConnect({
        connectionType: scaleConnectionType,
        portName: scalePortName,
        baudRate: Number(scaleBaudRate) || 9600,
        host: scaleHost,
        tcpPort: Number(scaleTcpPort) || 8000,
      });
      if (result.success) {
        setScaleConnected(true);
        toast.success('ترازو با موفقیت متصل شد');
      } else {
        toast.error(`خطا: ${result.error || 'اتصال ناموفق'}`);
      }
    } catch (err: any) {
      toast.error(String(err?.message || 'خطا در اتصال ترازو'));
    } finally {
      setScaleConnecting(false);
    }
  };

  const handleScaleDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.scaleDisconnect) return;
    try {
      await api.scaleDisconnect();
      setScaleConnected(false);
      toast.info('ترازو قطع شد');
    } catch {
      toast.error('خطا در قطع ترازو');
    }
  };

  const handleRefreshPorts = async () => {
    const api = window.electronAPI;
    if (!api?.scaleListPorts) return;
    try {
      const ports = await api.scaleListPorts();
      setScalePorts(ports ?? []);
      if (ports.length === 0) toast.info('پورت سریال یافت نشد');
    } catch {
      toast.error('خطا در دریافت پورت‌ها');
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
    const load = async () => {
      if (!window.electronAPI?.getReceiptPriceDisplayUnit) return;
      try {
        const u = await window.electronAPI.getReceiptPriceDisplayUnit();
        setReceiptPriceUnit(u === 'rial' ? 'rial' : 'toman');
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadTemplatesAndPerPrinter = async () => {
      const restaurantId = user?.restaurants?.[0]?.id;
      if (!token || !restaurantId) return;
      setLoadingTemplates(true);
      try {
        const [list, map] = await Promise.all([
          getPrintTemplates(restaurantId, token),
          window.electronAPI?.getPrintTemplatesMap?.() ?? Promise.resolve({}),
        ]);
        setPrintTemplates(list);
        setPrinterTemplatesMap(map ?? {});
      } catch {
        setPrintTemplates([]);
        setPrinterTemplatesMap({});
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplatesAndPerPrinter();
  }, [token, user?.restaurants?.[0]?.id]);

  const handlePrinterTemplateChange = async (printerName: string, templateId: string | null) => {
    if (!window.electronAPI?.setPrintTemplateForPrinter) return;
    setSavingTemplateForPrinter(printerName);
    try {
      if (!templateId || templateId === '') {
        await window.electronAPI.setPrintTemplateForPrinter(printerName, null);
        setPrinterTemplatesMap((prev) => ({ ...prev, [printerName]: null }));
      } else {
        const id = parseInt(templateId, 10);
        const t = printTemplates.find((x) => x.id === id);
        if (t) {
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
          await window.electronAPI.setPrintTemplateForPrinter(printerName, snapshot);
          setPrinterTemplatesMap((prev) => ({ ...prev, [printerName]: snapshot }));
        }
      }
    } finally {
      setSavingTemplateForPrinter(null);
    }
  };

  useEffect(() => {
    const sync = async () => {
      const restaurantId = user?.restaurants?.[0]?.id;
      if (!token || !restaurantId || !window.electronAPI?.getReceiptNumberSettings || !window.electronAPI?.saveReceiptNumberSettings) return;
      try {
        const [local, server] = await Promise.all([
          window.electronAPI.getReceiptNumberSettings(),
          getReceiptNumberSettingsFromServer(restaurantId, token),
        ]);
        if (server && local) {
          const dailyResetTime =
            server.dailyResetTime && /^\d{1,2}:\d{2}$/.test(server.dailyResetTime) ? server.dailyResetTime : '00:00';
          const mergedNextNumber = Math.max(
            1,
            Number(local.nextNumber) || 1,
            Number(server.nextNumber) || 1,
          );
          const mergedStartNumber = Math.max(
            1,
            Number(server.startNumber) || 1,
          );
          await window.electronAPI.saveReceiptNumberSettings({
            // اگر سمت سرور شماره بزرگ‌تری تنظیم شده باشد، روی دسکتاپ هم اعمال شود
            nextNumber: mergedNextNumber,
            lastResetDate:
              typeof server.lastResetDate === 'string'
                ? server.lastResetDate
                : local.lastResetDate ?? '',
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
    <div className="min-h-screen flex flex-col bg-default-100">
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold text-foreground">تنظیمات</h1>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">اطلاعات کاربر</h2>
            <div className="flex justify-between py-2 border-b border-default-200">
              <span className="text-default-500">نام:</span>
              <span>{user?.firstName} {user?.lastName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-default-200">
              <span className="text-default-500">موبایل:</span>
              <span>{user?.mobile}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-default-500">رستوران:</span>
              <span>{user?.restaurants?.[0]?.name || 'تعیین نشده'}</span>
            </div>
          </CardContent>
        </Card>

        {window.electronAPI?.getReceiptPriceDisplayUnit && (
          <Card>
            <CardContent className="gap-3">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">رسید چاپی</h2>
              <p className="text-sm text-default-500">
                مبالغ سفارش در سیستم به <strong>تومان</strong> ذخیره می‌شود. این گزینه فقط نحوهٔ نمایش روی رسید چاپی و پیش‌نمایش را عوض می‌کند.
              </p>
              <Select
                label="واحد نمایش مبلغ در رسید"
                selectedKeys={[receiptPriceUnit]}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as string | undefined;
                  if (v !== 'toman' && v !== 'rial') return;
                  setReceiptPriceUnit(v);
                  window.electronAPI?.saveReceiptPriceDisplayUnit?.(v).catch(() => {});
                }}
                variant="bordered"
                size="sm"
                className="max-w-md"
              >
                <SelectItem key="toman" textValue="تومان">تومان</SelectItem>
                <SelectItem key="rial" textValue="ریال">ریال (عدد × ۱۰ نسبت به تومان)</SelectItem>
              </Select>
            </CardContent>
          </Card>
        )}

        {window.electronAPI?.saveCardTerminalConfig && (
          <Card>
            <CardContent className="gap-3">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">کارتخوان‌ها</h2>
              <p className="text-sm text-default-500">
                مدیریت، افزودن و ویرایش کارتخوان‌ها از صفحه اختصاصی انجام می‌شود.
              </p>
              <Button variant="flat" color="primary" size="sm" onPress={() => navigate('/card-terminals')}>
                رفتن به مدیریت کارتخوان‌ها ←
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">ظاهر</h2>
            <div className="flex justify-between items-center py-2">
              <span className="text-default-500">حالت تاریک (دارک)</span>
              <Switch
                isSelected={theme === 'dark'}
                onValueChange={(isDark) => setTheme(isDark ? 'dark' : 'light')}
                aria-label="حالت تاریک"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">وضعیت اتصال</h2>
            <div className="flex justify-between items-center py-2">
              <span className="text-default-500">وضعیت:</span>
              <span className={isOnline ? 'text-success font-bold' : 'text-danger font-bold'}>
                {isOnline ? 'آنلاین' : 'آفلاین'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">همگام‌سازی</h2>
            <Button color="primary" onPress={handleSync} className="w-full">
              همگام‌سازی سفارشات آفلاین
            </Button>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-default-100 p-2">آنلاین: {accountingOnline ? 'بله' : 'خیر'}</div>
              <div className="rounded-lg bg-default-100 p-2">در حال سینک: {accountingSyncing ? 'بله' : 'خیر'}</div>
              <div className="rounded-lg bg-default-100 p-2">عملیات صف: {accountingPendingOps}</div>
              <div className="rounded-lg bg-default-100 p-2">ناموفق: {accountingFailedOps}</div>
            </div>
            {accountingLastSyncedAt ? (
              <p className="text-xs text-default-500">
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
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">بروزرسانی برنامه</h2>
              <p className="text-default-500 text-sm">در صورت وجود نسخه جدید، بنر بروزرسانی در بالای صفحه نمایش داده می‌شود.</p>
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

        <Card>
          <CardContent className="gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">تنظیمات پرینتر</h2>
              <Button size="sm" variant="light" color="primary" onPress={loadPrinters}>
                بروزرسانی لیست
              </Button>
            </div>
            {isLoadingPrinters ? (
              <p className="text-default-500">در حال دریافت لیست پرینترها...</p>
            ) : availablePrinters.length === 0 ? (
              <p className="text-default-500">هیچ پرینتری یافت نشد.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {availablePrinters.map((printer) => {
                  const config = configs[printer.name];
                  const isEnabled = !!config?.enabled;
                  const receipts = getPrinterReceipts(printer.name);
                  const fullReceipt = receipts.find((r) => r.type === 'full');
                  const kitchenReceipt = receipts.find((r) => r.type === 'kitchen');
                  const templateValue = printerTemplatesMap[printer.name] ? String(printerTemplatesMap[printer.name]!.id) : 'none';
                  return (
                    <Card key={printer.name} className="shadow-sm border border-default-200">
                      <CardContent className="gap-4">
                        <div className="flex flex-col gap-1">
                          <Checkbox
                            isSelected={isEnabled}
                            onValueChange={(checked) => setPrinterEnabled(printer, checked)}
                            classNames={{ label: 'font-semibold' }}
                          >
                            {printer.displayName || printer.name}
                          </Checkbox>
                          {printer.description && (
                            <p className="text-sm text-default-500 mr-6">{printer.description}</p>
                          )}
                        </div>
                        {isEnabled && (
                          <div className="flex flex-col gap-4 pr-6 border-t border-default-200 pt-4">
                            {loadingTemplates ? (
                              <p className="text-sm text-default-500">در حال بارگذاری قالب‌ها...</p>
                            ) : (
                              <Select
                                label="قالب چاپ"
                                placeholder="بدون قالب (تنظیمات دستی زیر)"
                                selectedKeys={[templateValue]}
                                onSelectionChange={(keys) => {
                                  const v = Array.from(keys)[0] as string | undefined;
                                  handlePrinterTemplateChange(printer.name, v === 'none' || !v ? null : v);
                                }}
                                isDisabled={savingTemplateForPrinter === printer.name}
                                variant="bordered"
                                size="sm"
                              >
                                <SelectItem key="none" textValue="بدون قالب">
                                  بدون قالب (تنظیمات دستی زیر)
                                </SelectItem>
                                {printTemplates.map((t) => (
                                  <SelectItem key={String(t.id)} textValue={`${t.name} (${t.paperWidth}×${t.paperLength} mm)`}>
                                    {t.name} ({t.paperWidth}×{t.paperLength} mm)
                                  </SelectItem>
                                ))}
                              </Select>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <Input
                                type="number"
                                label="عرض کاغذ (mm)"
                                value={String(config?.paperWidth ?? 80)}
                                onValueChange={(v) => updatePrinterConfig(printer.name, { paperWidth: Number(v) || 80 })}
                                min={40}
                                max={120}
                                variant="bordered"
                                size="sm"
                              />
                              <Input
                                type="number"
                                label="طول کاغذ (mm)"
                                value={String(config?.paperLength ?? 200)}
                                onValueChange={(v) => updatePrinterConfig(printer.name, { paperLength: Number(v) || 200 })}
                                min={80}
                                max={800}
                                variant="bordered"
                                size="sm"
                              />
                              <Input
                                type="number"
                                label="حاشیه (mm)"
                                value={String(config?.margin ?? 5)}
                                onValueChange={(v) => updatePrinterConfig(printer.name, { margin: Number(v) || 5 })}
                                min={0}
                                max={20}
                                variant="bordered"
                                size="sm"
                              />
                            </div>
                            <div className="border-t border-default-200 pt-4 space-y-3">
                              <h3 className="text-sm font-medium text-foreground">نوع رسید</h3>
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-default-50 border border-default-200">
                                  <Checkbox
                                    isSelected={fullReceipt?.enabled ?? true}
                                    onValueChange={(checked) => setReceiptEnabled(printer.name, 'full', checked)}
                                  >
                                    رسید کامل (با قیمت)
                                  </Checkbox>
                                  {(fullReceipt?.enabled ?? true) && (
                                    <Input
                                      type="number"
                                      size="sm"
                                      className="w-20"
                                      min={1}
                                      max={5}
                                      value={String(fullReceipt?.copies ?? 1)}
                                      onValueChange={(v) => setReceiptCopies(printer.name, 'full', Number(v) || 1)}
                                      aria-label="تعداد رسید کامل"
                                    />
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-default-50 border border-default-200">
                                  <Checkbox
                                    isSelected={kitchenReceipt?.enabled ?? false}
                                    onValueChange={(checked) => setReceiptEnabled(printer.name, 'kitchen', checked)}
                                  >
                                    رسید آشپزخانه (بدون قیمت)
                                  </Checkbox>
                                  {(kitchenReceipt?.enabled ?? false) && (
                                    <Input
                                      type="number"
                                      size="sm"
                                      className="w-20"
                                      min={1}
                                      max={5}
                                      value={String(kitchenReceipt?.copies ?? 1)}
                                      onValueChange={(v) => setReceiptCopies(printer.name, 'kitchen', Number(v) || 1)}
                                      aria-label="تعداد رسید آشپزخانه"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            <p className="text-default-500 text-sm">
              برای هر پرینتر می‌توانید قالب چاپ و نوع/تعداد رسید را جداگانه تنظیم کنید. این تنظیمات برای چاپ خودکار رسید هنگام ثبت سفارش استفاده می‌شود.
            </p>
          </CardContent>
        </Card>

        {/* مسیر ذخیره‌سازی داده‌ها */}
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h3 className="font-semibold text-default-700 text-sm">مسیر ذخیره‌سازی داده‌های برنامه</h3>
            {dataDir ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-default-500 text-xs">پوشه داده‌ها (userData):</span>
                  <code dir="ltr" className="block text-xs bg-default-100 px-2 py-1.5 rounded-lg break-all text-default-700 select-all">
                    {dataDir.userData}
                  </code>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  {Object.entries(dataDir.files).map(([label, filePath]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-default-500 text-xs">{label}:</span>
                      <code dir="ltr" className="block text-xs bg-default-100 px-2 py-1.5 rounded-lg break-all text-default-500 select-all">
                        {filePath}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-default-400 text-xs">در حال بارگذاری...</p>
            )}
          </CardContent>
        </Card>

        {window.electronAPI?.scaleLoadSettings && canManageHw && (
          <Card>
            <CardContent className="gap-3">
              <div className="flex items-center justify-between border-b-2 border-primary pb-2">
                <h2 className="text-lg font-semibold text-foreground">اتصال ترازو</h2>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${scaleConnected ? 'bg-success-100 text-success-700' : 'bg-default-100 text-default-500'}`}>
                  {scaleConnected ? 'متصل' : 'قطع'}
                </span>
              </div>

              <Select
                label="نوع اتصال"
                selectedKeys={[scaleConnectionType]}
                onSelectionChange={(keys) => setScaleConnectionType(String(Array.from(keys)[0] || 'serial') as 'serial' | 'tcp')}
                variant="bordered"
                size="sm"
                className="max-w-xs"
              >
                <SelectItem key="serial">سریال / USB (COM Port)</SelectItem>
                <SelectItem key="tcp">شبکه (TCP/IP)</SelectItem>
              </Select>

              {scaleConnectionType === 'serial' ? (
                <div className="flex gap-2 flex-wrap items-end">
                  <Select
                    label="پورت COM"
                    selectedKeys={scalePortName ? [scalePortName] : []}
                    onSelectionChange={(keys) => setScalePortName(String(Array.from(keys)[0] || ''))}
                    variant="bordered"
                    size="sm"
                    className="flex-1 min-w-[140px]"
                    placeholder={scalePorts.length === 0 ? 'پورتی یافت نشد' : 'انتخاب پورت'}
                  >
                    {scalePorts.map((p) => (
                      <SelectItem key={p.path} textValue={p.path}>
                        {p.path}{p.friendlyName ? ` — ${p.friendlyName}` : p.manufacturer ? ` (${p.manufacturer})` : ''}
                      </SelectItem>
                    ))}
                  </Select>
                  <Button size="sm" variant="flat" onPress={handleRefreshPorts}>
                    بازخوانی پورت‌ها
                  </Button>
                  <Select
                    label="Baud Rate"
                    selectedKeys={[scaleBaudRate]}
                    onSelectionChange={(keys) => setScaleBaudRate(String(Array.from(keys)[0] || '9600'))}
                    variant="bordered"
                    size="sm"
                    className="w-32"
                  >
                    {['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'].map((b) => (
                      <SelectItem key={b}>{b}</SelectItem>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Input
                    label="آدرس IP ترازو"
                    value={scaleHost}
                    onValueChange={setScaleHost}
                    placeholder="192.168.1.100"
                    variant="bordered"
                    size="sm"
                    className="flex-1 min-w-[180px]"
                  />
                  <Input
                    label="پورت TCP"
                    value={scaleTcpPort}
                    onValueChange={setScaleTcpPort}
                    placeholder="8000"
                    variant="bordered"
                    size="sm"
                    className="w-28"
                  />
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="flat" isLoading={scaleSaving} onPress={handleScaleSave}>
                  ذخیره تنظیمات
                </Button>
                {scaleConnected ? (
                  <Button size="sm" color="danger" variant="flat" onPress={handleScaleDisconnect}>
                    قطع اتصال
                  </Button>
                ) : (
                  <Button size="sm" color="primary" variant="flat" isLoading={scaleConnecting} onPress={handleScaleConnect}>
                    اتصال و تست
                  </Button>
                )}
              </div>

              <p className="text-xs text-default-400">
                پس از تنظیم، دکمه «اتصال و تست» را بزنید. اگر موفق شد ترازو آماده استفاده در فاکتور است.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Caller ID Settings */}
        {window.electronAPI?.getCallerIdSettings && canManageHw && (
          <Card>
            <CardContent>
              <div className="flex flex-col gap-4">
                {/* header + master toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">شناسایی تماس‌گیرنده (Caller ID)</h2>
                    <p className="text-xs text-default-400 mt-0.5">
                      هنگام تماس ورودی، اطلاعات مشتری و سوابق سفارش نمایش داده می‌شود.
                    </p>
                  </div>
                  <Switch isSelected={callerIdEnabled} onValueChange={setCallerIdEnabled} size="sm" aria-label="فعال‌سازی Caller ID" />
                </div>

                {callerIdEnabled && (
                  <div className="flex flex-col gap-4 border-t border-default-200 pt-3">

                    {/* mode selector */}
                    <Tabs
                      selectedKey={callerIdMode}
                      onSelectionChange={(k) => setCallerIdMode(k as 'webhook' | 'serial' | 'hid')}
                      aria-label="نوع ورودی Caller ID"
                    >
                      <TabListContainer>
                        <TabList>
                          <Tab id="webhook">🌐 VOIP / Webhook</Tab>
                          <Tab id="serial">🔌 دستگاه USB (COM)</Tab>
                          <Tab id="hid">📞 T-Line TK-202UH</Tab>
                        </TabList>
                      </TabListContainer>
                    </Tabs>

                    {/* ─── Webhook mode ─── */}
                    {callerIdMode === 'webhook' && (
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-2 flex-wrap items-end">
                          <Input label="پورت webhook محلی" value={callerIdPort} onValueChange={setCallerIdPort}
                            placeholder="5055" variant="bordered" size="sm" className="w-36"
                            description="سیستم VOIP به این پورت POST می‌زند" />
                          <Input label="نام فیلد شماره تماس" value={callerIdPhoneField} onValueChange={setCallerIdPhoneField}
                            placeholder="caller" variant="bordered" size="sm" className="w-40"
                            description='نام فیلد در body JSON' />
                        </div>
                        <Input label="توکن احراز هویت (اختیاری)" value={callerIdSecret} onValueChange={setCallerIdSecret}
                          placeholder="X-Secret یا Bearer token" variant="bordered" size="sm" type="password"
                          description="اگر خالی باشد همه درخواست‌ها پذیرفته می‌شوند" />
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${callerIdWebhookRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className="text-xs text-default-500">
                            {callerIdWebhookRunning ? `webhook فعال روی پورت ${callerIdPort}` : 'webhook غیرفعال'}
                          </span>
                        </div>
                        <div className="rounded-xl bg-default-100 p-3 text-xs text-default-500 flex flex-col gap-1">
                          <p className="font-semibold text-default-600">نحوه اتصال VOIP / FXO Gateway</p>
                          <code className="bg-default-200 rounded px-1.5 py-0.5 font-mono text-default-700 break-all">
                            POST http://127.0.0.1:{callerIdPort}/call
                          </code>
                          <code className="bg-default-200 rounded px-1.5 py-0.5 font-mono text-default-700">
                            {`{"${callerIdPhoneField || 'caller'}": "09123456789"}`}
                          </code>
                        </div>
                      </div>
                    )}

                    {/* ─── USB/Serial mode ─── */}
                    {callerIdMode === 'serial' && (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-default-500">
                          دستگاه‌های USB Caller ID موجود در بازار (جعبه تلفن با USB) را انتخاب کنید.
                          پس از وصل کردن USB، پورت‌ها را رفرش کنید.
                        </p>

                        <div className="flex gap-2 flex-wrap items-end">
                          <Select
                            label="دستگاه USB Caller ID"
                            placeholder="انتخاب پورت..."
                            variant="bordered"
                            size="sm"
                            className="flex-1 min-w-[160px]"
                            selectedKeys={callerIdSerialPort ? [callerIdSerialPort] : []}
                            onSelectionChange={(keys) => setCallerIdSerialPort(Array.from(keys)[0] as string)}
                          >
                            {callerIdSerialPorts.map((p) => (
                              <SelectItem key={p.path} value={p.path}>
                                {p.path}{p.friendlyName ? ` — ${p.friendlyName}` : p.manufacturer ? ` (${p.manufacturer})` : ''}
                              </SelectItem>
                            ))}
                          </Select>
                          <Button size="sm" variant="flat" onPress={handleCallerIdSerialRefreshPorts}>
                            رفرش پورت‌ها
                          </Button>
                        </div>

                        <div className="flex gap-2 flex-wrap items-end">
                          <Select
                            label="نرخ Baud"
                            variant="bordered"
                            size="sm"
                            className="w-36"
                            selectedKeys={[callerIdSerialBaud]}
                            onSelectionChange={(keys) => setCallerIdSerialBaud(Array.from(keys)[0] as string)}
                          >
                            {['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'].map((b) => (
                              <SelectItem key={b}>{b}</SelectItem>
                            ))}
                          </Select>
                          <Select
                            label="فرمت دستگاه"
                            variant="bordered"
                            size="sm"
                            className="flex-1 min-w-[180px]"
                            selectedKeys={[callerIdSerialFormat]}
                            onSelectionChange={(keys) => setCallerIdSerialFormat(Array.from(keys)[0] as string)}
                          >
                            <SelectItem key="auto">خودکار (تشخیص فرمت)</SelectItem>
                            <SelectItem key="at-clip">مودم AT — +CLIP</SelectItem>
                            <SelectItem key="cid-nmbr">CID — NMBR=...</SelectItem>
                            <SelectItem key="caller-field">CALLER: / NUMBER:</SelectItem>
                            <SelectItem key="raw-number">شماره خالص</SelectItem>
                          </Select>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${callerIdSerialConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className="text-xs text-default-500">
                            {callerIdSerialConnected ? `متصل روی ${callerIdSerialPort}` : 'قطع'}
                          </span>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          {callerIdSerialConnected ? (
                            <Button size="sm" color="danger" variant="flat" onPress={handleCallerIdSerialDisconnect}>
                              قطع اتصال دستگاه
                            </Button>
                          ) : (
                            <Button size="sm" color="primary" variant="flat"
                              isLoading={callerIdSerialConnecting} onPress={handleCallerIdSerialConnect}>
                              اتصال و تست دستگاه
                            </Button>
                          )}
                        </div>

                        <div className="rounded-xl bg-default-100 p-3 text-xs text-default-500 flex flex-col gap-1.5">
                          <p className="font-semibold text-default-600">دستگاه‌های USB سازگار</p>
                          <p>اکثر جعبه‌های Caller ID موجود در بازار ایران با فرمت «خودکار» کار می‌کنند.</p>
                          <p>اگر دستگاه شما از نوع مودم USB است (AT commands)، گزینه «مودم AT» را انتخاب کنید.</p>
                          <p>در صورت اتصال، هر تماس ورودی را با تست واقعی بررسی کنید.</p>
                        </div>
                      </div>
                    )}

                    {/* ─── T-Line TK-202UH HID mode ─── */}
                    {callerIdMode === 'hid' && (
                      <div className="flex flex-col gap-3">
                        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs flex flex-col gap-1.5">
                          <p className="font-semibold text-blue-700 dark:text-blue-300">📞 T-Line TK-202UH</p>
                          <p className="text-default-600">دستگاه USB Caller ID مدل TK-202UH تیلداکیش</p>
                          <p className="text-default-500">
                            قبل از اتصال، مطمئن شوید درایور <strong>WinUSB</strong> از طریق <strong>Zadig</strong> روی این دستگاه نصب شده باشد.
                            (منوی Options → List All Devices → T-Line TK-202UH → WinUSB → Replace Driver)
                          </p>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${callerIdHidDeviceFound ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <span className="text-xs text-default-500">
                              {callerIdHidDeviceFound ? 'دستگاه پیدا شد' : 'دستگاه یافت نشد'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${callerIdHidConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="text-xs text-default-500">
                              {callerIdHidConnected ? 'در حال پایش تماس‌ها' : 'قطع'}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="flat" onPress={handleCallerIdHidCheckDevice}>
                            🔍 شناسایی دستگاه
                          </Button>
                          {callerIdHidConnected ? (
                            <Button size="sm" color="danger" variant="flat" onPress={handleCallerIdHidDisconnect}>
                              قطع اتصال
                            </Button>
                          ) : (
                            <Button size="sm" color="primary" variant="flat"
                              isLoading={callerIdHidConnecting} onPress={handleCallerIdHidConnect}
                              isDisabled={!callerIdHidDeviceFound}>
                              اتصال و شروع پایش
                            </Button>
                          )}
                        </div>

                        <div className="rounded-xl bg-default-100 p-3 text-xs text-default-500 flex flex-col gap-1.5">
                          <p className="font-semibold text-default-600">راهنمای نصب Zadig</p>
                          <ol className="list-decimal list-inside flex flex-col gap-0.5 pr-1">
                            <li>دستگاه TK-202UH را به USB وصل کنید</li>
                            <li>Zadig را از <strong>zadig.akeo.ie</strong> دانلود و اجرا کنید</li>
                            <li>از منوی Options گزینه <strong>List All Devices</strong> را فعال کنید</li>
                            <li>دستگاه <strong>T-LINE</strong> یا <strong>TK-202UH</strong> را انتخاب کنید</li>
                            <li>درایور را روی <strong>WinUSB</strong> تنظیم کنید و <strong>Replace Driver</strong> را بزنید</li>
                            <li>پس از نصب، «شناسایی دستگاه» را بزنید</li>
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* ─── تنظیمات عمومی ─── */}
                    <div className="flex flex-col gap-2 border-t border-default-200 pt-3">
                      <Input label="مدت نمایش اعلان (ثانیه)" value={callerIdDuration} onValueChange={setCallerIdDuration}
                        placeholder="30" variant="bordered" size="sm" className="w-44" />
                      <div className="flex items-center gap-2">
                        <Switch isSelected={callerIdSound} onValueChange={setCallerIdSound} size="sm" aria-label="پخش صدا" />
                        <span className="text-sm text-default-600">پخش صدای زنگ هنگام تماس ورودی</span>
                      </div>
                    </div>
                  </div>
                )}

                <Button size="sm" variant="flat" isLoading={callerIdSaving} onPress={handleCallerIdSave}>
                  ذخیره تنظیمات Caller ID
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {window.electronAPI?.getPosWarehouseId && posWarehouseList.length > 1 && (
          <Card>
            <CardContent>
              <h3 className="font-semibold mb-3">انبار پایانه POS</h3>
              <p className="text-sm text-default-500 mb-3">
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
                    {w.name}{w.isDefault ? ' (پیش‌فرض)' : ''}
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
