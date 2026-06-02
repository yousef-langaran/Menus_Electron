import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Modal, ModalHeader, ModalBody, ModalFooter, Chip } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { Select, SelectItem } from '../ui/compat-select';
import { SwitchCompat as Switch } from '../ui/compat-switch';
import { ModalShell } from '../ui/modal-shell';
import { useAuthStore } from '../store/authStore';
import { toast } from '../utils/toast';

type CardTerminalSettings = {
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
  companyKey?: string;
  deviceIp?: string;
};

type CardTerminalProfile = {
  id: string;
  name: string;
  settings: CardTerminalSettings;
};

const DEFAULT_SETTINGS: CardTerminalSettings = {
  enabled: true,
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
};

type CompanyPreset = {
  key: string;
  label: string;
  port: number;
  urlPath: string;
  baseSettings: Partial<CardTerminalSettings>;
};

const COMPANY_PRESETS: CompanyPreset[] = [
  {
    key: 'sepehr',
    label: 'پرداخت الکترونیک سپهر (بانک صادرات)',
    port: 8080,
    urlPath: '/payment/sendrequest',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'Amount', orderIdFieldName: 'InvoiceNumber', restaurantIdFieldName: 'TerminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'status', messageFieldPath: 'description', referenceFieldPath: 'Rrn',
    },
  },
  {
    key: 'sep',
    label: 'پرداخت الکترونیک سامان (SEP)',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'amount', orderIdFieldName: 'invoiceNumber', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'refId',
    },
  },
  {
    key: 'asanpardakht',
    label: 'آسان پرداخت پرشین',
    port: 9000,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'amount', orderIdFieldName: 'invoiceNumber', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'refId',
    },
  },
  {
    key: 'behpardakht',
    label: 'به پرداخت ملت',
    port: 9090,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 60000, sendAmountUnit: 'toman',
      amountFieldName: 'amount', orderIdFieldName: 'orderId', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'x-api-key', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'trackingCode',
    },
  },
  {
    key: 'parsian',
    label: 'تجارت الکترونیک پارسیان (IranKish)',
    port: 8060,
    urlPath: '/api/pay',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'amount', orderIdFieldName: 'invoiceNumber', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'refNumber',
    },
  },
  {
    key: 'sadad',
    label: 'پرداخت الکترونیک سداد (بانک ملی)',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'amount', orderIdFieldName: 'invoiceNumber', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'refId',
    },
  },
  {
    key: 'pep',
    label: 'پرداخت الکترونیک پاسارگاد (PEP)',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'amount', orderIdFieldName: 'invoiceNumber', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'refId',
    },
  },
  {
    key: 'novin',
    label: 'پرداخت نوین آرین',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST', timeoutMs: 30000, sendAmountUnit: 'rial',
      amountFieldName: 'amount', orderIdFieldName: 'orderId', restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization', authToken: '',
      successFieldPath: 'success', messageFieldPath: 'message', referenceFieldPath: 'refId',
    },
  },
];

function buildEndpointUrl(companyKey: string, ip: string): string {
  const preset = COMPANY_PRESETS.find((p) => p.key === companyKey);
  if (!preset) return '';
  const host = ip.trim() || 'localhost';
  return `http://${host}:${preset.port}${preset.urlPath}`;
}

function FieldHelp({ text }: { text: string }) {
  return <p className="text-xs text-default-400 mt-0.5">{text}</p>;
}

function AdvancedFields({
  settings,
  onChange,
}: {
  settings: CardTerminalSettings;
  onChange: (patch: Partial<CardTerminalSettings>) => void;
}) {
  return (
    <div className="space-y-4 border-t border-default-200 pt-4">
      <p className="text-xs font-medium text-default-500">تنظیمات پیشرفته</p>

      <div className="space-y-1">
        <Input
          label="آدرس API (Endpoint URL)"
          placeholder="http://localhost:8080/payment"
          value={settings.endpointUrl}
          onValueChange={(v) => onChange({ endpointUrl: v })}
          variant="bordered"
          dir="ltr"
        />
        <FieldHelp text="اگر شرکت را انتخاب کرده‌اید، این فیلد خودکار پر می‌شود." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Select
            label="متد HTTP"
            selectedKeys={[settings.httpMethod]}
            onSelectionChange={(keys) => {
              const m = Array.from(keys)[0] as string | undefined;
              if (m) onChange({ httpMethod: m === 'PUT' ? 'PUT' : 'POST' });
            }}
            variant="bordered"
          >
            <SelectItem key="POST">POST</SelectItem>
            <SelectItem key="PUT">PUT</SelectItem>
          </Select>
        </div>
        <div className="space-y-1">
          <Input
            type="number"
            label="Timeout (ms)"
            value={String(settings.timeoutMs)}
            onValueChange={(v) => onChange({ timeoutMs: Math.max(3000, Number(v || 10000)) })}
            variant="bordered"
          />
          <FieldHelp text="۳۰۰۰۰ ms توصیه می‌شود." />
        </div>
        <div className="space-y-1">
          <Select
            label="واحد مبلغ"
            selectedKeys={[settings.sendAmountUnit]}
            onSelectionChange={(keys) => {
              const u = Array.from(keys)[0] as string | undefined;
              if (u) onChange({ sendAmountUnit: u === 'rial' ? 'rial' : 'toman' });
            }}
            variant="bordered"
          >
            <SelectItem key="toman">ریال</SelectItem>
            <SelectItem key="rial">ریال (×۱۰)</SelectItem>
          </Select>
        </div>
      </div>

      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">نام فیلدهای درخواست (Request Body)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="کلید مبلغ" placeholder="amount" value={settings.amountFieldName}
            onValueChange={(v) => onChange({ amountFieldName: v })} variant="bordered" />
          <Input label="کلید شماره سفارش" placeholder="orderId" value={settings.orderIdFieldName}
            onValueChange={(v) => onChange({ orderIdFieldName: v })} variant="bordered" />
          <Input label="کلید ترمینال" placeholder="terminalId" value={settings.restaurantIdFieldName}
            onValueChange={(v) => onChange({ restaurantIdFieldName: v })} variant="bordered" />
        </div>
      </fieldset>

      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">احراز هویت (اختیاری)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="نام هدر" placeholder="Authorization" value={settings.authHeaderName}
            onValueChange={(v) => onChange({ authHeaderName: v })} variant="bordered" />
          <Input label="توکن / کلید" placeholder="خالی بگذارید اگر نیاز نیست" value={settings.authToken}
            onValueChange={(v) => onChange({ authToken: v })} variant="bordered" />
        </div>
      </fieldset>

      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">مسیر فیلدها در پاسخ (Response)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Input label="تأیید موفقیت" placeholder="success" value={settings.successFieldPath}
              onValueChange={(v) => onChange({ successFieldPath: v })} variant="bordered" />
            <FieldHelp text='مثلاً "status" یا "success"' />
          </div>
          <Input label="پیام خطا" placeholder="message" value={settings.messageFieldPath}
            onValueChange={(v) => onChange({ messageFieldPath: v })} variant="bordered" />
          <div className="space-y-1">
            <Input label="شماره پیگیری" placeholder="refId" value={settings.referenceFieldPath}
              onValueChange={(v) => onChange({ referenceFieldPath: v })} variant="bordered" />
            <FieldHelp text='مثلاً "Rrn" یا "trackingCode"' />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

type ModalMode = { type: 'add' } | { type: 'edit'; profile: CardTerminalProfile };

export default function CardTerminalsPage() {
  const { user } = useAuthStore();
  const [profiles, setProfiles] = useState<CardTerminalProfile[]>([]);
  const [defaultId, setDefaultId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalSettings, setModalSettings] = useState<CardTerminalSettings>({ ...DEFAULT_SETTINGS });
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [ipAddress, setIpAddress] = useState<string>('localhost');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    if (!window.electronAPI?.getCardTerminalConfig) return;
    try {
      const cfg = await window.electronAPI.getCardTerminalConfig();
      const p = (cfg?.profiles || []) as CardTerminalProfile[];
      setProfiles(p);
      setDefaultId(cfg?.defaultProfileId || p[0]?.id || '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = async (nextProfiles: CardTerminalProfile[], nextDefaultId: string, msg?: string) => {
    if (!window.electronAPI?.saveCardTerminalConfig) return false;
    const result = await window.electronAPI.saveCardTerminalConfig({
      profiles: nextProfiles,
      defaultProfileId: nextDefaultId,
    });
    if (result?.success) {
      setProfiles(nextProfiles);
      setDefaultId(nextDefaultId);
      if (msg) toast.success(msg);
      return true;
    } else {
      toast.error(result?.error || 'ذخیره ناموفق بود.');
      return false;
    }
  };

  const handleCompanyChange = (key: string) => {
    setSelectedCompany(key);
    const preset = COMPANY_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const ip = ipAddress.trim() || 'localhost';
    const url = buildEndpointUrl(key, ip);
    setModalSettings((prev) => ({
      ...DEFAULT_SETTINGS,
      enabled: prev.enabled,
      ...preset.baseSettings,
      endpointUrl: url,
      companyKey: key,
      deviceIp: ip,
    }));
  };

  const handleIpChange = (ip: string) => {
    setIpAddress(ip);
    if (selectedCompany) {
      const url = buildEndpointUrl(selectedCompany, ip);
      setModalSettings((prev) => ({ ...prev, endpointUrl: url, deviceIp: ip.trim() || 'localhost' }));
    }
  };

  const openAdd = () => {
    setModalName(`کارتخوان ${profiles.length + 1}`);
    setModalSettings({ ...DEFAULT_SETTINGS });
    setSelectedCompany('');
    setIpAddress('localhost');
    setShowAdvanced(false);
    setModal({ type: 'add' });
  };

  const openEdit = (profile: CardTerminalProfile) => {
    setModalName(profile.name);
    setModalSettings({ ...profile.settings });
    setSelectedCompany(profile.settings.companyKey || '');
    setIpAddress(profile.settings.deviceIp || 'localhost');
    setShowAdvanced(!profile.settings.companyKey);
    setModal({ type: 'edit', profile });
  };

  const closeModal = () => setModal(null);

  const handleModalSave = async () => {
    if (!modalName.trim()) { toast.warning('نام کارتخوان را وارد کنید.'); return; }
    if (!modalSettings.endpointUrl?.trim()) { toast.warning('آدرس اتصال کارتخوان مشخص نیست. شرکت و IP را انتخاب کنید.'); return; }
    setIsSaving(true);
    try {
      const settings: CardTerminalSettings = {
        ...modalSettings,
        timeoutMs: Number(modalSettings.timeoutMs || 10000),
        companyKey: selectedCompany || undefined,
        deviceIp: selectedCompany ? (ipAddress.trim() || 'localhost') : undefined,
      };
      if (modal?.type === 'add') {
        const newProfile: CardTerminalProfile = { id: `terminal-${Date.now()}`, name: modalName.trim(), settings };
        const next = [...profiles, newProfile];
        const ok = await persist(next, defaultId || newProfile.id, 'کارتخوان جدید افزوده شد.');
        if (ok) closeModal();
      } else if (modal?.type === 'edit') {
        const next = profiles.map((p) =>
          p.id === modal.profile.id ? { ...p, name: modalName.trim(), settings } : p,
        );
        const ok = await persist(next, defaultId, 'تغییرات ذخیره شد.');
        if (ok) closeModal();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    await persist(profiles, id, 'کارتخوان پیش‌فرض تغییر کرد.');
  };

  const handleDelete = async (id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    const fallback = next[0]?.id || '';
    await persist(next, defaultId === id ? fallback : defaultId, 'کارتخوان حذف شد.');
    setDeleteTargetId(null);
  };

  const handleTest = async (profile: CardTerminalProfile) => {
    if (!window.electronAPI?.testCardTerminalConnection) return;
    setTestingId(profile.id);
    try {
      const result = await window.electronAPI.testCardTerminalConnection({
        amount: 10000,
        restaurantId: user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined,
        terminalProfileId: profile.id,
      });
      if (result?.success) {
        toast.success(`تست موفق${result.refId ? ` — Ref: ${result.refId}` : ''}`);
      } else {
        toast.error(result?.error || 'تست کارتخوان ناموفق بود.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'خطا در تست کارتخوان');
    } finally {
      setTestingId(null);
    }
  };

  const isSupported = !!window.electronAPI?.saveCardTerminalConfig;

  return (
    <div className="min-h-screen flex flex-col bg-default-100">
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">مدیریت کارتخوان‌ها</h1>
        {isSupported && (
          <Button color="primary" size="sm" onPress={openAdd}>+ افزودن کارتخوان</Button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4 max-w-4xl mx-auto w-full space-y-4">
        {!isSupported && (
          <Card><CardContent>
            <p className="text-default-500 text-sm text-center py-4">این قابلیت فقط در محیط Electron در دسترس است.</p>
          </CardContent></Card>
        )}

        {isSupported && profiles.length === 0 && (
          <Card><CardContent>
            <div className="flex flex-col items-center gap-3 py-10 text-default-400">
              <span className="text-4xl">🖥️</span>
              <p className="text-sm">هنوز کارتخوانی تعریف نشده است.</p>
              <Button color="primary" size="sm" onPress={openAdd}>افزودن اولین کارتخوان</Button>
            </div>
          </CardContent></Card>
        )}

        {isSupported && profiles.map((profile) => {
          const companyLabel = profile.settings.companyKey
            ? COMPANY_PRESETS.find((p) => p.key === profile.settings.companyKey)?.label
            : null;
          return (
            <Card key={profile.id}>
              <CardContent className="gap-0">
                <div className="flex items-center justify-between flex-wrap gap-3 py-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{profile.name}</span>
                    {profile.id === defaultId && <Chip size="sm" color="primary" variant="flat">پیش‌فرض</Chip>}
                    <Chip size="sm" color={profile.settings.enabled ? 'success' : 'default'} variant="flat">
                      {profile.settings.enabled ? 'فعال' : 'غیرفعال'}
                    </Chip>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="flat" onPress={() => handleTest(profile)}
                      isLoading={testingId === profile.id} isDisabled={!!testingId}>
                      تست اتصال
                    </Button>
                    {profile.id !== defaultId && (
                      <Button size="sm" variant="flat" color="secondary" onPress={() => handleSetDefault(profile.id)}>
                        پیش‌فرض
                      </Button>
                    )}
                    <Button size="sm" variant="flat" onPress={() => openEdit(profile)}>ویرایش</Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => setDeleteTargetId(profile.id)}
                      isDisabled={profiles.length <= 1}>
                      حذف
                    </Button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm border-t border-default-100 pt-3">
                  {companyLabel ? (
                    <>
                      <div className="flex gap-2 text-default-500">
                        <span className="shrink-0">شرکت:</span>
                        <span className="text-foreground">{companyLabel}</span>
                      </div>
                      <div className="flex gap-2 text-default-500">
                        <span className="shrink-0">IP دستگاه:</span>
                        <span className="text-foreground font-mono" dir="ltr">
                          {profile.settings.deviceIp || 'localhost'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-2 text-default-500 col-span-2">
                      <span className="shrink-0">آدرس:</span>
                      <span className="text-foreground truncate font-mono text-xs" dir="ltr">
                        {profile.settings.endpointUrl || '—'}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2 text-default-500">
                    <span className="shrink-0">واحد مبلغ:</span>
                    <span className="text-foreground">
                      {profile.settings.sendAmountUnit === 'toman' ? 'ریال' : 'ریال'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={!!modal} onOpenChange={(open) => !open && closeModal()}>
        <ModalShell size="2xl" scrollBehavior="inside">
          <ModalHeader className="border-b border-default-200 pb-3">
            <span className="text-lg font-bold">
              {modal?.type === 'add' ? 'افزودن کارتخوان جدید' : 'ویرایش کارتخوان'}
            </span>
          </ModalHeader>
          <ModalBody className="py-4">
            <div className="space-y-4" dir="rtl">
              <Input
                label="نام کارتخوان"
                value={modalName}
                onValueChange={setModalName}
                variant="bordered"
                autoFocus
              />

              {/* Simple Setup */}
              <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-primary-800">اتصال سریع کارتخوان</p>
                <p className="text-xs text-primary-600">
                  شرکت کارتخوان خود را انتخاب کنید و آدرس IP دستگاه را وارد کنید. بقیه تنظیمات خودکار پر می‌شوند.
                </p>

                <Select
                  label="شرکت کارتخوان"
                  placeholder="شرکت خود را انتخاب کنید..."
                  selectedKeys={selectedCompany ? [selectedCompany] : []}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0] as string | undefined;
                    if (key) handleCompanyChange(key);
                  }}
                  variant="bordered"
                >
                  {COMPANY_PRESETS.map((p) => (
                    <SelectItem key={p.key}>{p.label}</SelectItem>
                  ))}
                </Select>

                {selectedCompany && (
                  <div className="space-y-2">
                    <Input
                      label="آدرس IP دستگاه کارتخوان"
                      placeholder="localhost"
                      value={ipAddress}
                      onValueChange={handleIpChange}
                      variant="bordered"
                      dir="ltr"
                    />
                    <p className="text-xs text-primary-600">
                      اگر نرم‌افزار کارتخوان روی همین کامپیوتر است، <span dir="ltr" className="font-mono">localhost</span> را بگذارید.
                      اگر روی کامپیوتر دیگری در شبکه است، IP آن را وارد کنید (مثلاً <span dir="ltr" className="font-mono">192.168.1.10</span>).
                    </p>
                    <div className="rounded-lg bg-white border border-primary-200 px-3 py-2 flex items-center gap-2">
                      <span className="text-xs text-default-500 shrink-0">آدرس اتصال:</span>
                      <span className="text-xs font-mono text-primary-700 break-all" dir="ltr">
                        {modalSettings.endpointUrl || '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Enable toggle */}
              <div className="flex justify-between items-center py-2 px-3 bg-default-50 rounded-xl border border-default-200">
                <span className="text-sm text-default-600">فعال‌سازی این کارتخوان</span>
                <Switch
                  isSelected={modalSettings.enabled}
                  onValueChange={(v) => setModalSettings((prev) => ({ ...prev, enabled: v }))}
                  aria-label="فعال‌سازی کارتخوان"
                />
              </div>

              {/* Advanced toggle */}
              <Button
                size="sm"
                variant="flat"
                color="default"
                onPress={() => setShowAdvanced((v) => !v)}
                className="w-full text-default-500"
              >
                {showAdvanced ? '▲ پنهان کردن تنظیمات پیشرفته' : '▼ تنظیمات پیشرفته (برای کارشناسان)'}
              </Button>

              {showAdvanced && (
                <AdvancedFields
                  settings={modalSettings}
                  onChange={(patch) => setModalSettings((prev) => ({ ...prev, ...patch }))}
                />
              )}
            </div>
          </ModalBody>
          <ModalFooter className="border-t border-default-200 pt-3">
            <div className="flex gap-2 flex-row-reverse w-full">
              <Button color="primary" onPress={handleModalSave} isLoading={isSaving}>ذخیره</Button>
              <Button variant="outline" onPress={closeModal} isDisabled={isSaving}>انصراف</Button>
            </div>
          </ModalFooter>
        </ModalShell>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <ModalShell size="sm">
          <ModalHeader className="border-b border-default-200 pb-3">
            <span className="font-bold">حذف کارتخوان</span>
          </ModalHeader>
          <ModalBody className="py-4">
            <p className="text-sm text-default-600" dir="rtl">
              آیا از حذف «{profiles.find((p) => p.id === deleteTargetId)?.name}» مطمئن هستید؟
              این عملیات قابل بازگشت نیست.
            </p>
          </ModalBody>
          <ModalFooter className="border-t border-default-200 pt-3">
            <div className="flex gap-2 flex-row-reverse w-full">
              <Button color="danger" onPress={() => deleteTargetId && handleDelete(deleteTargetId)}>حذف</Button>
              <Button variant="outline" onPress={() => setDeleteTargetId(null)}>انصراف</Button>
            </div>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
