import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip, Spinner } from '@heroui/react';
import { Input } from '../../../ui/compat-input';
import { Textarea } from '../../../ui/compat-textarea';
import { CheckboxCompat as Checkbox } from '../../../ui/compat-checkbox';
import {
  searchAddress,
  quoteDeliveryFee,
  type NeshanSearchItem,
  type DeliveryQuoteResult,
} from '../../../services/api';

const fa = (n: number) => n.toLocaleString('fa-IR');

interface SavedAddress {
  id: number | string;
  label?: string | null;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

interface Props {
  restaurantId?: number;
  token: string | null;
  customerPhone: string;
  cartSubtotal: number;
  savedAddresses: SavedAddress[];
  address: string;
  onAddressChange: (address: string) => void;
  location: { lat: number; lng: number } | null;
  onLocationChange: (loc: { lat: number; lng: number } | null) => void;
  feeOverride: number | null;
  onFeeOverrideChange: (fee: number | null, reason: string) => void;
}

/**
 * انتخاب مقصد ارسال در صندوق الکترون.
 *
 * تفاوت اساسی با نسخهٔ وب: **این اپ آفلاین‌اول است.** جست‌وجوی نشان،
 * نقشه و استعلام کرایه هر سه به اینترنت نیاز دارند. پس:
 *
 *   • هیچ‌کدام از این‌ها مانع ثبت سفارش نیست
 *   • در حالت آفلاین مستقیم به مسیر «آدرس متنی + کرایهٔ دستی» می‌رود
 *   • نقشه عمداً رندر نمی‌شود (SDK نشان بدون شبکه فقط بوم خاکستری است
 *     و صندوق‌دار را گیج می‌کند)
 *
 * مسیر آنلاین همان سه‌مرحله‌ای وب است: تایپ ⇒ انتخاب ⇒ تأیید مختصات.
 */
export function DeliveryDestination({
  restaurantId,
  token,
  customerPhone,
  cartSubtotal,
  savedAddresses,
  address,
  onAddressChange,
  location,
  onLocationChange,
  feeOverride,
  onFeeOverrideChange,
}: Props) {
  const [online, setOnline] = useState(true);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<NeshanSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [quote, setQuote] = useState<DeliveryQuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [manualFeeText, setManualFeeText] = useState(
    feeOverride != null ? String(Math.round(feeOverride / 10)) : '',
  );

  const abortRef = useRef(false);

  // ── وضعیت اتصال ────────────────────────────────────────────────
  useEffect(() => {
    const check = () =>
      (window.electronAPI
        ? window.electronAPI.checkOnline()
        : Promise.resolve(navigator.onLine)
      ).then(setOnline);

    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, []);

  // ── جست‌وجوی آدرس (فقط آنلاین) ─────────────────────────────────
  useEffect(() => {
    const trimmed = term.trim();
    if (!online || !token || trimmed.length < 3) {
      setResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const items = await searchAddress(trimmed, token);
        setResults(items.slice(0, 5));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [term, online, token]);

  // ── استعلام کرایه (فقط آنلاین و با مختصات) ─────────────────────
  const runQuote = useCallback(async () => {
    if (!online || !location || !restaurantId || !token) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    try {
      const result = await quoteDeliveryFee(
        { restaurantId, dropoff: location, cartSubtotal },
        token,
      );
      if (!abortRef.current) setQuote(result);
    } catch {
      if (!abortRef.current) setQuote(null);
    } finally {
      if (!abortRef.current) setQuoting(false);
    }
  }, [online, location, restaurantId, cartSubtotal, token]);

  useEffect(() => {
    abortRef.current = false;
    const timer = setTimeout(runQuote, 250);
    return () => {
      abortRef.current = true;
      clearTimeout(timer);
    };
  }, [runQuote]);

  const pickSearchResult = (item: NeshanSearchItem) => {
    onLocationChange({ lat: item.location.y, lng: item.location.x });
    onAddressChange(item.address || item.title);
    setTerm('');
    setResults([]);
  };

  const pickSaved = (item: SavedAddress) => {
    onAddressChange(item.address);
    if (item.latitude != null && item.longitude != null) {
      onLocationChange({ lat: item.latitude, lng: item.longitude });
    } else {
      onLocationChange(null);
    }
  };

  const commitManualFee = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    setManualFeeText(digits);
    onFeeOverrideChange(
      digits ? Number(digits) * 10 : null,
      online ? 'خارج از محدوده — تأیید صندوق‌دار' : 'ثبت در حالت آفلاین',
    );
  };

  // کرایهٔ دستی لازم است وقتی محاسبهٔ خودکار در دسترس نیست یا رد شده
  const needsManualFee =
    !online || !location || (quote != null && !quote.serviceable) || (!quoting && location != null && quote == null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">مقصد ارسال</span>
        {!online && (
          <Chip size="sm" color="warning" variant="flat">
            آفلاین — نقشه در دسترس نیست
          </Chip>
        )}
      </div>

      {/* آدرس‌های قبلی — آفلاین هم کار می‌کند چون از قبل لود شده */}
      {savedAddresses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {savedAddresses.map((item) => (
            <Checkbox
              key={item.id}
              isSelected={address === item.address}
              onValueChange={() => pickSaved(item)}
            >
              <span className="text-sm">
                {item.label ? `${item.label}: ` : ''}
                {item.address}
                {item.latitude != null && (
                  <span className="text-success ms-1 text-xs">(روی نقشه)</span>
                )}
              </span>
            </Checkbox>
          ))}
        </div>
      )}

      {/* جست‌وجو — فقط آنلاین */}
      {online && (
        <div className="relative">
          <Input
            size="sm"
            placeholder="جست‌وجوی آدرس روی نقشه…"
            value={term}
            onValueChange={setTerm}
            variant="bordered"
            classNames={{ input: 'text-right' }}
            endContent={searching ? <Spinner size="sm" /> : null}
          />
          {results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
              {results.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="w-full px-3 py-2 text-right text-sm hover:bg-default-soft"
                  onClick={() => pickSearchResult(item)}
                >
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-muted">{item.address}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* آدرس متنی — همیشه، آنلاین یا آفلاین */}
      <Textarea
        placeholder="آدرس کامل تحویل (پلاک، واحد، زنگ…)"
        value={address}
        onValueChange={onAddressChange}
        minRows={2}
        variant="bordered"
        classNames={{ input: 'text-right' }}
      />

      {/* نتیجهٔ استعلام */}
      {online && location && (
        <div className="rounded-lg border border-border p-2.5">
          {quoting && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" />
              محاسبهٔ کرایه…
            </div>
          )}
          {!quoting && quote && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                کرایه: {fa(Math.round(quote.fee / 10))} تومان
              </span>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{fa(Math.round(quote.distanceM / 100) / 10)} کیلومتر</span>
                <Chip
                  size="sm"
                  color={quote.serviceable ? 'success' : 'danger'}
                  variant="flat"
                >
                  {quote.serviceable ? 'داخل محدوده' : 'خارج از محدوده'}
                </Chip>
              </div>
            </div>
          )}
        </div>
      )}

      {/* کرایهٔ دستی — مسیر خروج، هرگز مانع ثبت سفارش نیست */}
      {needsManualFee && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning-soft p-2.5">
          <span className="text-xs text-warning-soft-foreground">
            {!online
              ? 'در حالت آفلاین کرایه محاسبه نمی‌شود — مبلغ را دستی وارد کنید.'
              : !location
                ? 'مقصد روی نقشه مشخص نشده — کرایه را دستی وارد کنید.'
                : 'این آدرس خارج از محدوده است — کرایه را دستی وارد کنید.'}
          </span>
          <Input
            size="sm"
            placeholder="کرایهٔ ارسال (تومان)"
            value={manualFeeText}
            onValueChange={commitManualFee}
            variant="bordered"
            classNames={{ input: 'text-right' }}
          />
        </div>
      )}

      {customerPhone.trim().length === 0 && (
        <span className="text-xs text-muted">
          با وارد کردن شمارهٔ مشتری، آدرس‌های قبلی‌اش پیشنهاد می‌شود.
        </span>
      )}
    </div>
  );
}
