import type { CardTerminalSettings } from './shared';
import type { AsanPardakhtConnectionMode } from './shared';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { SwitchCompat as Switch } from '../../ui/compat-switch';

export function FieldHelp({ text }: { text: string }) {
  return <p className="text-xs text-muted mt-0.5">{text}</p>;
}

export function AdvancedFields({
  settings,
  onChange,
}: {
  settings: CardTerminalSettings;
  onChange: (patch: Partial<CardTerminalSettings>) => void;
}) {
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <p className="text-xs font-medium text-muted">تنظیمات پیشرفته</p>

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

      <fieldset className="border border-border rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-foreground/70 px-1">
          نام فیلدهای درخواست (Request Body)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="کلید مبلغ"
            placeholder="amount"
            value={settings.amountFieldName}
            onValueChange={(v) => onChange({ amountFieldName: v })}
            variant="bordered"
          />
          <Input
            label="کلید شماره سفارش"
            placeholder="orderId"
            value={settings.orderIdFieldName}
            onValueChange={(v) => onChange({ orderIdFieldName: v })}
            variant="bordered"
          />
          <Input
            label="کلید ترمینال"
            placeholder="terminalId"
            value={settings.restaurantIdFieldName}
            onValueChange={(v) => onChange({ restaurantIdFieldName: v })}
            variant="bordered"
          />
        </div>
      </fieldset>

      <fieldset className="border border-border rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-foreground/70 px-1">
          احراز هویت (اختیاری)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="نام هدر"
            placeholder="Authorization"
            value={settings.authHeaderName}
            onValueChange={(v) => onChange({ authHeaderName: v })}
            variant="bordered"
          />
          <Input
            label="توکن / کلید"
            placeholder="خالی بگذارید اگر نیاز نیست"
            value={settings.authToken}
            onValueChange={(v) => onChange({ authToken: v })}
            variant="bordered"
          />
        </div>
      </fieldset>

      <fieldset className="border border-border rounded-xl p-3 space-y-3">
        <legend className="text-xs font-medium text-foreground/70 px-1">
          مسیر فیلدها در پاسخ (Response)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Input
              label="تأیید موفقیت"
              placeholder="success"
              value={settings.successFieldPath}
              onValueChange={(v) => onChange({ successFieldPath: v })}
              variant="bordered"
            />
            <FieldHelp text='مثلاً "status" یا "success"' />
          </div>
          <Input
            label="پیام خطا"
            placeholder="message"
            value={settings.messageFieldPath}
            onValueChange={(v) => onChange({ messageFieldPath: v })}
            variant="bordered"
          />
          <div className="space-y-1">
            <Input
              label="شماره پیگیری"
              placeholder="refId"
              value={settings.referenceFieldPath}
              onValueChange={(v) => onChange({ referenceFieldPath: v })}
              variant="bordered"
            />
            <FieldHelp text='مثلاً "Rrn" یا "trackingCode"' />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

export function SerialTlvFields({
  settings,
  onChange,
}: {
  settings: CardTerminalSettings;
  onChange: (patch: Partial<CardTerminalSettings>) => void;
}) {
  const [ports, setPorts] = useState<
    Array<{ path: string; manufacturer?: string; friendlyName?: string }>
  >([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  const refreshPorts = useCallback(async () => {
    if (!window.electronAPI?.scaleListPorts) return;
    setLoadingPorts(true);
    try {
      setPorts(await window.electronAPI.scaleListPorts());
    } finally {
      setLoadingPorts(false);
    }
  }, []);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning/40 bg-warning-soft p-3">
        <p className="text-xs text-warning-soft-foreground">
          ⚠️ این حالت (اتصال مستقیم سریال با پروتکل TLV سامان/SEP) آزمایشی است. قبل از استفاده در
          تراکنش واقعی، حتماً با یک مبلغ کوچک روی کارتخوان فیزیکی تست کنید.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <Select
          label="پورت COM کارتخوان"
          selectedKeys={settings.serialPortName ? [settings.serialPortName] : []}
          onSelectionChange={(keys) =>
            onChange({ serialPortName: String(Array.from(keys)[0] || '') })
          }
          variant="bordered"
          className="flex-1 min-w-[160px]"
          placeholder={ports.length === 0 ? 'پورتی یافت نشد' : 'انتخاب پورت'}
        >
          {ports.map((p) => (
            <SelectItem key={p.path} textValue={p.path}>
              {p.path}
              {p.friendlyName
                ? ` — ${p.friendlyName}`
                : p.manufacturer
                  ? ` (${p.manufacturer})`
                  : ''}
            </SelectItem>
          ))}
        </Select>
        <Button size="sm" variant="flat" onPress={refreshPorts} isLoading={loadingPorts}>
          بازخوانی پورت‌ها
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          type="number"
          label="Baud Rate"
          value={String(settings.serialBaudRate)}
          onValueChange={(v) => onChange({ serialBaudRate: Number(v) || 19200 })}
          variant="bordered"
        />
        <div className="flex items-end pb-1">
          <div className="flex items-center justify-between w-full py-2 px-3 bg-default-soft rounded-xl border border-border">
            <span className="text-sm text-foreground/70">With Handshake</span>
            <Switch
              isSelected={settings.serialWithHandshake}
              onValueChange={(v) => onChange({ serialWithHandshake: v })}
              aria-label="With Handshake"
            />
          </div>
        </div>
      </div>
      <FieldHelp text="مطابق راهنمای پروتکل: 19200 baud / 8 data bits / no parity / 1 stop bit — این تنظیمات پیش‌فرض کارتخوان‌های سامان است." />
    </div>
  );
}

export function AsanPardakhtFields({
  settings,
  onChange,
}: {
  settings: CardTerminalSettings;
  onChange: (patch: Partial<CardTerminalSettings>) => void;
}) {
  const [ports, setPorts] = useState<
    Array<{ path: string; manufacturer?: string; friendlyName?: string }>
  >([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  const refreshPorts = useCallback(async () => {
    if (!window.electronAPI?.scaleListPorts) return;
    setLoadingPorts(true);
    try {
      setPorts(await window.electronAPI.scaleListPorts());
    } finally {
      setLoadingPorts(false);
    }
  }, []);

  useEffect(() => {
    if (settings.asanPardakhtMode === 'serial') refreshPorts();
  }, [settings.asanPardakhtMode, refreshPorts]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning/40 bg-warning-soft p-3">
        <p className="text-xs text-warning-soft-foreground">
          ⚠️ اتصال مستقیم به SDK آسان‌پرداخت (PosInterface.dll) است. کد موفقیت/شکست تراکنش تأیید
          نهایی نشده — قبل از استفاده در تراکنش واقعی حتماً با یک مبلغ کوچک روی کارتخوان فیزیکی تست
          کنید.
        </p>
      </div>

      <Select
        label="نوع اتصال به کارتخوان"
        selectedKeys={[settings.asanPardakhtMode]}
        onSelectionChange={(keys) =>
          onChange({
            asanPardakhtMode: String(Array.from(keys)[0] || 'lan') as AsanPardakhtConnectionMode,
          })
        }
        variant="bordered"
      >
        <SelectItem key="lan">شبکه (LAN)</SelectItem>
        <SelectItem key="serial">پورت سریال (COM)</SelectItem>
      </Select>

      {settings.asanPardakhtMode === 'serial' ? (
        <div className="flex gap-2 flex-wrap items-end">
          <Select
            label="پورت COM کارتخوان"
            selectedKeys={settings.asanPardakhtComPort ? [settings.asanPardakhtComPort] : []}
            onSelectionChange={(keys) =>
              onChange({ asanPardakhtComPort: String(Array.from(keys)[0] || '') })
            }
            variant="bordered"
            className="flex-1 min-w-[160px]"
            placeholder={ports.length === 0 ? 'پورتی یافت نشد' : 'انتخاب پورت'}
          >
            {ports.map((p) => (
              <SelectItem key={p.path} textValue={p.path}>
                {p.path}
                {p.friendlyName
                  ? ` — ${p.friendlyName}`
                  : p.manufacturer
                    ? ` (${p.manufacturer})`
                    : ''}
              </SelectItem>
            ))}
          </Select>
          <Button size="sm" variant="flat" onPress={refreshPorts} isLoading={loadingPorts}>
            بازخوانی پورت‌ها
          </Button>
          <Input
            type="number"
            label="Baud Rate"
            value={String(settings.asanPardakhtBaudRate)}
            onValueChange={(v) => onChange({ asanPardakhtBaudRate: Number(v) || 9600 })}
            variant="bordered"
            className="w-32"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="آدرس IP کارتخوان"
            placeholder="192.168.1.50"
            value={settings.asanPardakhtIp}
            onValueChange={(v) => onChange({ asanPardakhtIp: v })}
            variant="bordered"
            dir="ltr"
          />
          <Input
            type="number"
            label="پورت"
            value={String(settings.asanPardakhtPort)}
            onValueChange={(v) => onChange({ asanPardakhtPort: Number(v) || 17000 })}
            variant="bordered"
          />
        </div>
      )}
      <FieldHelp text="مقادیر IP/پورت یا COM Port باید دقیقاً همان تنظیماتی باشد که در نرم‌افزار PCPOS روی خود کارتخوان تنظیم شده است." />
    </div>
  );
}
