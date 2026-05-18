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

type Preset = { label: string; description: string; settings: Partial<CardTerminalSettings> };

const PRESETS: Preset[] = [
  {
    label: 'سپهر (بانک صادرات)',
    description: 'نرم‌افزار کارتخوان سپهر — پورت 8080 روی همین کامپیوتر',
    settings: {
      endpointUrl: 'http://localhost:8080/payment/sendrequest',
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'Amount',
      orderIdFieldName: 'InvoiceNumber',
      restaurantIdFieldName: 'TerminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'status',
      messageFieldPath: 'description',
      referenceFieldPath: 'Rrn',
    },
  },
  {
    label: 'پارسیان (IranKish)',
    description: 'سرویس محلی کارتخوان پارسیان — پورت 8060',
    settings: {
      endpointUrl: 'http://localhost:8060/api/pay',
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'invoiceNumber',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refNumber',
    },
  },
  {
    label: 'یکتاپی (YektaPay)',
    description: 'اپلیکیشن یکتاپی روی همین سیستم',
    settings: {
      endpointUrl: 'http://localhost:9090/api/payment',
      httpMethod: 'POST',
      timeoutMs: 60000,
      sendAmountUnit: 'toman',
      amountFieldName: 'amount',
      orderIdFieldName: 'orderId',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'x-api-key',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'trackingCode',
    },
  },
  {
    label: 'سفارشی',
    description: 'تنظیمات دستی برای سایر نرم‌افزارهای کارتخوان',
    settings: {},
  },
];

function FieldHelp({ text }: { text: string }) {
  return <p className="text-xs text-default-400 mt-0.5">{text}</p>;
}

function TerminalFormFields({
  settings,
  onChange,
  onApplyPreset,
}: {
  settings: CardTerminalSettings;
  onChange: (patch: Partial<CardTerminalSettings>) => void;
  onApplyPreset?: (preset: Preset) => void;
}) {
  return (
    <div className="space-y-4">
      {/* انتخاب پریست */}
      {onApplyPreset && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 space-y-2">
          <p className="text-sm font-medium text-primary-800">بارگذاری تنظیمات پیش‌فرض نرم‌افزار</p>
          <p className="text-xs text-primary-600">
            نرم‌افزار کارتخوان روی کامپیوتر شما یک سرویس محلی راه می‌اندازد (معمولاً روی localhost).
            یک پریست انتخاب کنید تا فیلدها خودکار پر شوند، سپس در صورت نیاز ویرایش کنید.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="flat"
                color="primary"
                onPress={() => onApplyPreset(p)}
                title={p.description}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center py-1 px-2 bg-default-50 rounded-xl border border-default-200">
        <span className="text-sm text-default-600">فعال‌سازی این کارتخوان</span>
        <Switch
          isSelected={settings.enabled}
          onValueChange={(v) => onChange({ enabled: v })}
          aria-label="فعال‌سازی کارتخوان"
        />
      </div>

      {/* اتصال */}
      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">اتصال به سرویس محلی</legend>
        <div className="space-y-1">
          <Input
            label="آدرس API (Endpoint URL)"
            placeholder="http://localhost:8080/payment"
            value={settings.endpointUrl}
            onValueChange={(v) => onChange({ endpointUrl: v })}
            variant="bordered"
          />
          <FieldHelp text="آدرسی که نرم‌افزار کارتخوان روی همین کامپیوتر در اختیار می‌گذارد. معمولاً localhost یا 127.0.0.1 با یک پورت مشخص است." />
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
            <FieldHelp text="معمولاً POST است." />
          </div>
          <div className="space-y-1">
            <Input
              type="number"
              label="Timeout (میلی‌ثانیه)"
              value={String(settings.timeoutMs)}
              onValueChange={(v) => onChange({ timeoutMs: Math.max(3000, Number(v || 10000)) })}
              variant="bordered"
            />
            <FieldHelp text="حداکثر زمان انتظار برای پاسخ کارتخوان. برای کارت‌کشیدن ۳۰۰۰۰ ms مناسب است." />
          </div>
          <div className="space-y-1">
            <Select
              label="واحد مبلغ ارسالی"
              selectedKeys={[settings.sendAmountUnit]}
              onSelectionChange={(keys) => {
                const u = Array.from(keys)[0] as string | undefined;
                if (u) onChange({ sendAmountUnit: u === 'rial' ? 'rial' : 'toman' });
              }}
              variant="bordered"
            >
              <SelectItem key="toman">تومان</SelectItem>
              <SelectItem key="rial">ریال (×۱۰)</SelectItem>
            </Select>
            <FieldHelp text="مبلغ سفارش در سیستم به تومان است. اگر کارتخوان ریال می‌خواهد، «ریال» انتخاب کنید تا ×۱۰ ارسال شود." />
          </div>
        </div>
      </fieldset>

      {/* نگاشت فیلدهای درخواست */}
      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">نام فیلدهای بدنه درخواست (Request Body)</legend>
        <p className="text-xs text-default-400">
          وقتی مبلغ به کارتخوان ارسال می‌شود، یک JSON با این کلیدها فرستاده می‌شود. نام هر کلید باید با مستندات نرم‌افزار کارتخوان شما مطابقت داشته باشد.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Input
              label="کلید مبلغ"
              placeholder="amount"
              value={settings.amountFieldName}
              onValueChange={(v) => onChange({ amountFieldName: v })}
              variant="bordered"
            />
            <FieldHelp text='مثلاً "amount" یا "Amount" یا "price"' />
          </div>
          <div className="space-y-1">
            <Input
              label="کلید شماره سفارش"
              placeholder="orderId"
              value={settings.orderIdFieldName}
              onValueChange={(v) => onChange({ orderIdFieldName: v })}
              variant="bordered"
            />
            <FieldHelp text='مثلاً "orderId" یا "InvoiceNumber"' />
          </div>
          <div className="space-y-1">
            <Input
              label="کلید شناسه ترمینال"
              placeholder="terminalId"
              value={settings.restaurantIdFieldName}
              onValueChange={(v) => onChange({ restaurantIdFieldName: v })}
              variant="bordered"
            />
            <FieldHelp text='شناسه رستوران یا ترمینال شما — مثلاً "terminalId"' />
          </div>
        </div>
      </fieldset>

      {/* احراز هویت */}
      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">احراز هویت (اختیاری)</legend>
        <p className="text-xs text-default-400">
          اگر نرم‌افزار کارتخوان به توکن یا کلید API نیاز دارد، اینجا وارد کنید. در غیر این صورت خالی بگذارید.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Input
              label="نام هدر"
              placeholder="Authorization"
              value={settings.authHeaderName}
              onValueChange={(v) => onChange({ authHeaderName: v })}
              variant="bordered"
            />
            <FieldHelp text='مثلاً "Authorization" یا "x-api-key"' />
          </div>
          <div className="space-y-1">
            <Input
              label="مقدار توکن / کلید"
              placeholder="Bearer your-token-here"
              value={settings.authToken}
              onValueChange={(v) => onChange({ authToken: v })}
              variant="bordered"
            />
            <FieldHelp text="اگر نرم‌افزار نیاز ندارد، خالی بگذارید." />
          </div>
        </div>
      </fieldset>

      {/* مسیر فیلدهای پاسخ */}
      <fieldset className="border border-default-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-default-600 px-1">مسیر فیلدها در پاسخ (Response)</legend>
        <p className="text-xs text-default-400">
          بعد از کارت‌کشیدن، کارتخوان یک JSON برمی‌گرداند. اینجا مشخص کنید کدام کلید نشان‌دهنده موفقیت/پیام/شماره پیگیری است.
          برای مسیرهای تودرتو از نقطه استفاده کنید، مثلاً <span dir="ltr" className="font-mono">data.result.success</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Input
              label="مسیر تأیید موفقیت"
              placeholder="success"
              value={settings.successFieldPath}
              onValueChange={(v) => onChange({ successFieldPath: v })}
              variant="bordered"
            />
            <FieldHelp text='اگر مقدار این فیلد true یا 0 باشد، پرداخت موفق تلقی می‌شود. مثلاً "status" یا "result"' />
          </div>
          <div className="space-y-1">
            <Input
              label="مسیر پیام"
              placeholder="message"
              value={settings.messageFieldPath}
              onValueChange={(v) => onChange({ messageFieldPath: v })}
              variant="bordered"
            />
            <FieldHelp text='پیام توضیحی که در صورت خطا نمایش داده می‌شود. مثلاً "description"' />
          </div>
          <div className="space-y-1">
            <Input
              label="مسیر شماره پیگیری"
              placeholder="refId"
              value={settings.referenceFieldPath}
              onValueChange={(v) => onChange({ referenceFieldPath: v })}
              variant="bordered"
            />
            <FieldHelp text='شماره مرجع تراکنش. مثلاً "Rrn" یا "trackingCode" یا "refNumber"' />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

type ModalMode = { type: 'add' } | { type: 'edit'; profile: CardTerminalProfile };

const applyPreset = (preset: Preset, current: CardTerminalSettings): CardTerminalSettings => ({
  ...current,
  ...preset.settings,
});

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

  const load = useCallback(async () => {
    if (!window.electronAPI?.getCardTerminalConfig) return;
    try {
      const cfg = await window.electronAPI.getCardTerminalConfig();
      const p = (cfg?.profiles || []) as CardTerminalProfile[];
      setProfiles(p);
      setDefaultId(cfg?.defaultProfileId || p[0]?.id || '');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (
    nextProfiles: CardTerminalProfile[],
    nextDefaultId: string,
    msg?: string,
  ) => {
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

  const openAdd = () => {
    setModalName(`کارتخوان ${profiles.length + 1}`);
    setModalSettings({ ...DEFAULT_SETTINGS });
    setModal({ type: 'add' });
  };

  const openEdit = (profile: CardTerminalProfile) => {
    setModalName(profile.name);
    setModalSettings({ ...profile.settings });
    setModal({ type: 'edit', profile });
  };

  const closeModal = () => setModal(null);

  const handleModalSave = async () => {
    if (!modalName.trim()) {
      toast.warning('نام کارتخوان را وارد کنید.');
      return;
    }
    setIsSaving(true);
    try {
      if (modal?.type === 'add') {
        const newProfile: CardTerminalProfile = {
          id: `terminal-${Date.now()}`,
          name: modalName.trim(),
          settings: { ...modalSettings, timeoutMs: Number(modalSettings.timeoutMs || 10000) },
        };
        const next = [...profiles, newProfile];
        const ok = await persist(next, defaultId || newProfile.id, 'کارتخوان جدید افزوده شد.');
        if (ok) closeModal();
      } else if (modal?.type === 'edit') {
        const next = profiles.map((p) =>
          p.id === modal.profile.id
            ? { ...p, name: modalName.trim(), settings: { ...modalSettings, timeoutMs: Number(modalSettings.timeoutMs || 10000) } }
            : p,
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
          <Button color="primary" size="sm" onPress={openAdd}>
            + افزودن کارتخوان
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4 max-w-4xl mx-auto w-full space-y-4">
        {!isSupported && (
          <Card>
            <CardContent>
              <p className="text-default-500 text-sm text-center py-4">
                این قابلیت فقط در محیط Electron در دسترس است.
              </p>
            </CardContent>
          </Card>
        )}

        {isSupported && profiles.length === 0 && (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-3 py-10 text-default-400">
                <span className="text-4xl">🖥️</span>
                <p className="text-sm">هنوز کارتخوانی تعریف نشده است.</p>
                <Button color="primary" size="sm" onPress={openAdd}>
                  افزودن اولین کارتخوان
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isSupported && profiles.map((profile) => (
          <Card key={profile.id}>
            <CardContent className="gap-0">
              <div className="flex items-center justify-between flex-wrap gap-3 py-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{profile.name}</span>
                  {profile.id === defaultId && (
                    <Chip size="sm" color="primary" variant="flat">پیش‌فرض</Chip>
                  )}
                  <Chip
                    size="sm"
                    color={profile.settings.enabled ? 'success' : 'default'}
                    variant="flat"
                  >
                    {profile.settings.enabled ? 'فعال' : 'غیرفعال'}
                  </Chip>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => handleTest(profile)}
                    isLoading={testingId === profile.id}
                    isDisabled={!!testingId}
                  >
                    تست اتصال
                  </Button>
                  {profile.id !== defaultId && (
                    <Button
                      size="sm"
                      variant="flat"
                      color="secondary"
                      onPress={() => handleSetDefault(profile.id)}
                    >
                      انتخاب به‌عنوان پیش‌فرض
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => openEdit(profile)}
                  >
                    ویرایش
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    onPress={() => setDeleteTargetId(profile.id)}
                    isDisabled={profiles.length <= 1}
                  >
                    حذف
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm border-t border-default-100 pt-3">
                <div className="flex gap-2 text-default-500">
                  <span className="shrink-0">آدرس API:</span>
                  <span className="text-foreground truncate font-mono text-xs" dir="ltr">
                    {profile.settings.endpointUrl || '—'}
                  </span>
                </div>
                <div className="flex gap-2 text-default-500">
                  <span className="shrink-0">متد:</span>
                  <span className="text-foreground">{profile.settings.httpMethod}</span>
                </div>
                <div className="flex gap-2 text-default-500">
                  <span className="shrink-0">واحد مبلغ:</span>
                  <span className="text-foreground">{profile.settings.sendAmountUnit === 'toman' ? 'تومان' : 'ریال'}</span>
                </div>
                <div className="flex gap-2 text-default-500">
                  <span className="shrink-0">Timeout:</span>
                  <span className="text-foreground">{profile.settings.timeoutMs.toLocaleString('fa-IR')} ms</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
              <TerminalFormFields
                settings={modalSettings}
                onChange={(patch) => setModalSettings((prev) => ({ ...prev, ...patch }))}
                onApplyPreset={(preset) => setModalSettings((prev) => applyPreset(preset, prev))}
              />
            </div>
          </ModalBody>
          <ModalFooter className="border-t border-default-200 pt-3">
            <div className="flex gap-2 flex-row-reverse w-full">
              <Button color="primary" onPress={handleModalSave} isLoading={isSaving}>
                ذخیره
              </Button>
              <Button variant="outline" onPress={closeModal} isDisabled={isSaving}>
                انصراف
              </Button>
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
              <Button
                color="danger"
                onPress={() => deleteTargetId && handleDelete(deleteTargetId)}
              >
                حذف
              </Button>
              <Button variant="outline" onPress={() => setDeleteTargetId(null)}>
                انصراف
              </Button>
            </div>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
