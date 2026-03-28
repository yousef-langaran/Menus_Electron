import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Input, Select, SelectItem, Checkbox, Switch } from '@heroui/react';
import { useAuthStore } from '../store/authStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { useThemeStore } from '../store/themeStore';
import { getReceiptNumberSettingsFromServer, getPrintTemplates, type PrintTemplateItem } from '../services/api';

export default function SettingsPage() {
  const navigate = useNavigate();
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
          await window.electronAPI.saveReceiptNumberSettings({
            nextNumber: local.nextNumber,
            lastResetDate: local.lastResetDate ?? '',
            resetPolicy: server.resetPolicy,
            startNumber: local.startNumber ?? server.startNumber,
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

  return (
    <div className="min-h-screen flex flex-col bg-default-100">
      <header className="bg-content1 border-b border-default-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-foreground">تنظیمات</h1>
        <Button color="primary" variant="flat" onPress={() => navigate('/order')}>
          بازگشت
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        <Card>
          <CardBody className="gap-3">
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
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">ظاهر</h2>
            <div className="flex justify-between items-center py-2">
              <span className="text-default-500">حالت تاریک (دارک)</span>
              <Switch
                isSelected={theme === 'dark'}
                onValueChange={(isDark) => setTheme(isDark ? 'dark' : 'light')}
                aria-label="حالت تاریک"
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">وضعیت اتصال</h2>
            <div className="flex justify-between items-center py-2">
              <span className="text-default-500">وضعیت:</span>
              <span className={isOnline ? 'text-success font-bold' : 'text-danger font-bold'}>
                {isOnline ? 'آنلاین' : 'آفلاین'}
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">همگام‌سازی</h2>
            <Button color="primary" onPress={handleSync} className="w-full">
              همگام‌سازی سفارشات آفلاین
            </Button>
            {syncStatus && (
              <p className="px-3 py-2 rounded-lg bg-default-100 text-foreground text-center text-sm">{syncStatus}</p>
            )}
          </CardBody>
        </Card>

        {window.electronAPI?.checkForUpdates && (
          <Card>
            <CardBody className="gap-3">
              <h2 className="text-lg font-semibold text-foreground border-b-2 border-primary pb-2">بروزرسانی برنامه</h2>
              <p className="text-default-500 text-sm">در صورت وجود نسخه جدید، بنر بروزرسانی در بالای صفحه نمایش داده می‌شود.</p>
              <Button color="primary" variant="flat" onPress={() => window.electronAPI?.checkForUpdates?.()}>
                بررسی بروزرسانی
              </Button>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody className="gap-4">
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
                    <Card key={printer.name} shadow="sm" className="border border-default-200">
                      <CardBody className="gap-4">
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
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
            <p className="text-default-500 text-sm">
              برای هر پرینتر می‌توانید قالب چاپ و نوع/تعداد رسید را جداگانه تنظیم کنید. این تنظیمات برای چاپ خودکار رسید هنگام ثبت سفارش استفاده می‌شود.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Button color="danger" variant="flat" className="w-full" onPress={logout}>
              خروج از حساب کاربری
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
