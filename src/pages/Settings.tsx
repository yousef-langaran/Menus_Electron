import { useState, useEffect } from 'react';
import { Card, CardContent } from '@heroui/react';
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

type CardTerminalFormState = {
  enabled: boolean;
  endpointUrl: string;
  httpMethod: 'POST' | 'PUT';
  timeoutMs: number;
  amountFieldName: string;
  orderIdFieldName: string;
  restaurantIdFieldName: string;
  sendAmountUnit: 'toman' | 'rial';
  authHeaderName: string;
  authToken: string;
  successFieldPath: string;
  messageFieldPath: string;
  referenceFieldPath: string;
};
type CardTerminalProfile = { id: string; name: string; settings: CardTerminalFormState };

export default function SettingsPage() {
  const { user, token, logout } = useAuthStore();
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState('');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [printerError, setPrinterError] = useState('');
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
  const [cardTerminal, setCardTerminal] = useState<CardTerminalFormState>({
    enabled: false,
    endpointUrl: '',
    httpMethod: 'POST',
    timeoutMs: 10000,
    amountFieldName: 'amount',
    orderIdFieldName: 'orderId',
    restaurantIdFieldName: 'restaurantId',
    sendAmountUnit: 'toman',
    authHeaderName: 'Authorization',
    authToken: '',
    successFieldPath: 'success',
    messageFieldPath: 'message',
    referenceFieldPath: 'refId',
  });
  const [cardTerminalStatus, setCardTerminalStatus] = useState('');
  const [cardTerminalProfiles, setCardTerminalProfiles] = useState<CardTerminalProfile[]>([]);
  const [selectedCardTerminalId, setSelectedCardTerminalId] = useState<string>('');
  const [defaultCardTerminalId, setDefaultCardTerminalId] = useState<string>('');
  const [isSavingCardTerminal, setIsSavingCardTerminal] = useState(false);
  const [isTestingCardTerminal, setIsTestingCardTerminal] = useState(false);
  const [updateCheckHint, setUpdateCheckHint] = useState('');
  const [dataDir, setDataDir] = useState<{ userData: string; files: Record<string, string> } | null>(null);
  const {
    isOnline: accountingOnline,
    isSyncing: accountingSyncing,
    pendingOps: accountingPendingOps,
    failedOps: accountingFailedOps,
    lastSyncedAt: accountingLastSyncedAt,
    lastError: accountingLastError,
  } = useSyncStore();

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
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateNotAvailable || !api?.onUpdateAvailable) return;
    const unsubNa = api.onUpdateNotAvailable(() => setUpdateCheckHint('شما آخرین نسخه را دارید.'));
    const unsubAv = api.onUpdateAvailable(() => setUpdateCheckHint(''));
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
    const loadCardTerminal = async () => {
      if (!window.electronAPI?.getCardTerminalConfig) return;
      try {
        const cfg = await window.electronAPI.getCardTerminalConfig();
        const profiles = (cfg?.profiles || []) as CardTerminalProfile[];
        const selectedId = cfg?.defaultProfileId || profiles[0]?.id || '';
        setCardTerminalProfiles(profiles);
        setDefaultCardTerminalId(selectedId);
        setSelectedCardTerminalId(selectedId);
        const settings = profiles.find((p) => p.id === selectedId)?.settings;
        if (settings) {
          setCardTerminal((prev) => ({
            ...prev,
            ...settings,
            httpMethod: settings.httpMethod === 'PUT' ? 'PUT' : 'POST',
            sendAmountUnit: settings.sendAmountUnit === 'rial' ? 'rial' : 'toman',
            timeoutMs: Number(settings.timeoutMs || 10000),
          }));
        }
      } catch {
        // ignore
      }
    };
    loadCardTerminal();
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
      setSyncStatus('این قابلیت فقط در Electron در دسترس است');
      return;
    }
    setSyncStatus('در حال همگام‌سازی...');
    if (!token) {
      setSyncStatus('برای ارسال سفارشات ابتدا وارد شوید.');
      return;
    }
    try {
      const result = await window.electronAPI.syncOrders(token);
      setSyncStatus(`همگام‌سازی انجام شد: ${result.success} موفق، ${result.failed} ناموفق`);
    } catch (err: unknown) {
      setSyncStatus(`خطا در همگام‌سازی: ${err instanceof Error ? err.message : 'نامشخص'}`);
    }
  };

  const loadPrinters = async () => {
    if (!window.electronAPI) return;
    setIsLoadingPrinters(true);
    setPrinterError('');
    try {
      const printers = await window.electronAPI.getPrinters();
      setAvailablePrinters(printers);
    } catch (err: unknown) {
      console.error('Printer load error:', err);
      setPrinterError(err instanceof Error ? err.message : 'خطا در دریافت لیست پرینترها');
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  const saveCardTerminalConfig = async () => {
    if (!window.electronAPI?.saveCardTerminalConfig) return;
    setIsSavingCardTerminal(true);
    setCardTerminalStatus('');
    try {
      const activeId = selectedCardTerminalId || defaultCardTerminalId || cardTerminalProfiles[0]?.id;
      if (!activeId) {
        setCardTerminalStatus('ابتدا یک کارتخوان ایجاد کنید.');
        return;
      }
      const nextProfiles = cardTerminalProfiles.map((p) =>
        p.id === activeId
          ? {
              ...p,
              settings: {
                ...cardTerminal,
                timeoutMs: Number(cardTerminal.timeoutMs || 10000),
              },
            }
          : p,
      );
      await persistCardTerminalProfiles(nextProfiles, defaultCardTerminalId || activeId, 'تنظیمات کارتخوان ذخیره شد.');
    } catch (err: any) {
      setCardTerminalStatus(err?.message || 'خطا در ذخیره تنظیمات کارتخوان');
    } finally {
      setIsSavingCardTerminal(false);
    }
  };

  const persistCardTerminalProfiles = async (
    profiles: CardTerminalProfile[],
    defaultId: string,
    statusText?: string,
  ) => {
    if (!window.electronAPI?.saveCardTerminalConfig) return;
    const result = await window.electronAPI.saveCardTerminalConfig({
      profiles,
      defaultProfileId: defaultId,
    });
    if (result?.success) {
      setCardTerminalProfiles(profiles);
      setDefaultCardTerminalId(defaultId);
      if (statusText) setCardTerminalStatus(statusText);
    } else {
      setCardTerminalStatus(result?.error || 'ذخیره پروفایل‌های کارتخوان ناموفق بود.');
    }
  };

  const testCardTerminalConfig = async () => {
    if (!window.electronAPI?.testCardTerminalConnection) return;
    setIsTestingCardTerminal(true);
    setCardTerminalStatus('');
    try {
      const result = await window.electronAPI.testCardTerminalConnection({
        amount: 10000,
        restaurantId: user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined,
        terminalProfileId: selectedCardTerminalId || undefined,
      });
      if (result?.success) {
        setCardTerminalStatus(`تست موفق بود${result.refId ? ` (Ref: ${result.refId})` : ''}`);
      } else {
        setCardTerminalStatus(result?.error || 'تست کارتخوان ناموفق بود.');
      }
    } catch (err: any) {
      setCardTerminalStatus(err?.message || 'خطا در تست کارتخوان');
    } finally {
      setIsTestingCardTerminal(false);
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

        {window.electronAPI?.saveCardTerminalSettings && (
          <Card>
            <CardContent className="gap-3">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">تنظیمات کارتخوان</h2>
              <div className="flex justify-between items-center py-1">
                <span className="text-default-500">فعال‌سازی اتصال کارتخوان در دسکتاپ</span>
                <Switch
                  isSelected={cardTerminal.enabled}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, enabled: v }))}
                  aria-label="فعال‌سازی کارتخوان"
                />
              </div>
              {cardTerminalProfiles.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select
                    label="کارتخوان انتخابی"
                    selectedKeys={selectedCardTerminalId ? [selectedCardTerminalId] : []}
                    onSelectionChange={(keys) => {
                      const id = String(Array.from(keys)[0] || '');
                      if (!id) return;
                      setSelectedCardTerminalId(id);
                      const next = cardTerminalProfiles.find((p) => p.id === id);
                      if (next) setCardTerminal(next.settings);
                    }}
                    variant="bordered"
                  >
                    {cardTerminalProfiles.map((p) => (
                      <SelectItem key={p.id}>{p.name}</SelectItem>
                    ))}
                  </Select>
                  <Input
                    label="نام کارتخوان"
                    value={
                      cardTerminalProfiles.find((p) => p.id === selectedCardTerminalId)?.name || ''
                    }
                    onValueChange={(v) => {
                      setCardTerminalProfiles((prev) =>
                        prev.map((p) => (p.id === selectedCardTerminalId ? { ...p, name: v || 'کارتخوان' } : p)),
                      );
                    }}
                    variant="bordered"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="آدرس API کارتخوان"
                  placeholder="http://127.0.0.1:8080/pay"
                  value={cardTerminal.endpointUrl}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, endpointUrl: v }))}
                  variant="bordered"
                />
                <Select
                  label="متد HTTP"
                  selectedKeys={[cardTerminal.httpMethod]}
                  onSelectionChange={(keys) => {
                    const method = Array.from(keys)[0] as string | undefined;
                    if (!method) return;
                    setCardTerminal((prev) => ({ ...prev, httpMethod: method === 'PUT' ? 'PUT' : 'POST' }));
                  }}
                  variant="bordered"
                >
                  <SelectItem key="POST">POST</SelectItem>
                  <SelectItem key="PUT">PUT</SelectItem>
                </Select>
                <Input
                  type="number"
                  label="Timeout (ms)"
                  value={String(cardTerminal.timeoutMs)}
                  onValueChange={(v) =>
                    setCardTerminal((prev) => ({ ...prev, timeoutMs: Math.max(3000, Number(v || 10000)) }))
                  }
                  variant="bordered"
                />
                <Select
                  label="واحد مبلغ ارسالی"
                  selectedKeys={[cardTerminal.sendAmountUnit]}
                  onSelectionChange={(keys) => {
                    const unit = Array.from(keys)[0] as string | undefined;
                    if (!unit) return;
                    setCardTerminal((prev) => ({ ...prev, sendAmountUnit: unit === 'rial' ? 'rial' : 'toman' }));
                  }}
                  variant="bordered"
                >
                  <SelectItem key="toman">تومان</SelectItem>
                  <SelectItem key="rial">ریال</SelectItem>
                </Select>
                <Input
                  label="نام فیلد مبلغ"
                  value={cardTerminal.amountFieldName}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, amountFieldName: v }))}
                  variant="bordered"
                />
                <Input
                  label="نام فیلد شماره سفارش"
                  value={cardTerminal.orderIdFieldName}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, orderIdFieldName: v }))}
                  variant="bordered"
                />
                <Input
                  label="نام فیلد شناسه رستوران"
                  value={cardTerminal.restaurantIdFieldName}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, restaurantIdFieldName: v }))}
                  variant="bordered"
                />
                <Input
                  label="نام هدر توکن"
                  value={cardTerminal.authHeaderName}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, authHeaderName: v }))}
                  variant="bordered"
                />
                <Input
                  label="توکن/کلید احراز هویت"
                  value={cardTerminal.authToken}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, authToken: v }))}
                  variant="bordered"
                />
                <Input
                  label="مسیر success در پاسخ"
                  value={cardTerminal.successFieldPath}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, successFieldPath: v }))}
                  variant="bordered"
                />
                <Input
                  label="مسیر message در پاسخ"
                  value={cardTerminal.messageFieldPath}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, messageFieldPath: v }))}
                  variant="bordered"
                />
                <Input
                  label="مسیر refId در پاسخ"
                  value={cardTerminal.referenceFieldPath}
                  onValueChange={(v) => setCardTerminal((prev) => ({ ...prev, referenceFieldPath: v }))}
                  variant="bordered"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button color="primary" onPress={saveCardTerminalConfig} isLoading={isSavingCardTerminal}>
                  ذخیره تنظیمات کارتخوان
                </Button>
                <Button
                  variant="flat"
                  onPress={async () => {
                    const id = `terminal-${Date.now()}`;
                    const next: CardTerminalProfile = {
                      id,
                      name: `کارتخوان ${cardTerminalProfiles.length + 1}`,
                      settings: { ...cardTerminal },
                    };
                    const profiles = [...cardTerminalProfiles, next];
                    setSelectedCardTerminalId(id);
                    await persistCardTerminalProfiles(profiles, defaultCardTerminalId || id, 'کارتخوان جدید اضافه شد.');
                  }}
                >
                  افزودن کارتخوان جدید
                </Button>
                <Button
                  variant="flat"
                  color="warning"
                  onPress={async () => {
                    if (!selectedCardTerminalId) return;
                    const next = cardTerminalProfiles.filter((p) => p.id !== selectedCardTerminalId);
                    const fallback = next[0]?.id || '';
                    setSelectedCardTerminalId(fallback);
                    if (fallback) {
                      const settings = next.find((p) => p.id === fallback)?.settings;
                      if (settings) setCardTerminal(settings);
                    }
                    await persistCardTerminalProfiles(next, defaultCardTerminalId === selectedCardTerminalId ? fallback : defaultCardTerminalId, 'کارتخوان حذف شد.');
                  }}
                  isDisabled={!selectedCardTerminalId || cardTerminalProfiles.length <= 1}
                >
                  حذف کارتخوان انتخابی
                </Button>
                <Button
                  variant="flat"
                  color="secondary"
                  onPress={async () => {
                    if (!selectedCardTerminalId) return;
                    await persistCardTerminalProfiles(cardTerminalProfiles, selectedCardTerminalId, 'کارتخوان پیش‌فرض تغییر کرد.');
                  }}
                >
                  انتخاب به‌عنوان پیش‌فرض
                </Button>
                <Button variant="flat" color="secondary" onPress={testCardTerminalConfig} isLoading={isTestingCardTerminal}>
                  تست اتصال (ارسال مبلغ نمونه)
                </Button>
              </div>
              {cardTerminalStatus ? (
                <p className="text-sm rounded-lg bg-default-100 p-2">{cardTerminalStatus}</p>
              ) : null}
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
            {syncStatus && (
              <p className="px-3 py-2 rounded-lg bg-default-100 text-foreground text-center text-sm">{syncStatus}</p>
            )}
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
                    setUpdateCheckHint('');
                    try {
                      const result = await window.electronAPI?.checkForUpdates?.();
                      if (result && 'ok' in result && !result.ok && result.message) {
                        setUpdateCheckHint(result.message);
                      }
                    } catch {
                      setUpdateCheckHint('خطا در درخواست بررسی بروزرسانی.');
                    }
                  })();
                }}
              >
                بررسی بروزرسانی
              </Button>
              {updateCheckHint ? (
                <p className="text-default-600 text-sm text-center">{updateCheckHint}</p>
              ) : null}
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
            ) : printerError ? (
              <p className="text-danger">{printerError}</p>
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
