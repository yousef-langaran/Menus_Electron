import { useEffect, useState } from 'react';

/** آیکون‌های عمومی UI — هیچ‌کدام مختص یک نوع کسب‌وکار نیستند (نه پیتزا، نه قیچی، ...) */
function IconBolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}
function IconTable({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <path d="M3 10v10M21 10v10M7 20v-4M17 20v-4" />
    </svg>
  );
}
function IconReceipt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function IconWifi({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 8.5c5.5-5 14.5-5 20 0M5.5 12c3.8-3.3 9.2-3.3 13 0M9 15.5c2-1.7 4-1.7 6 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RailButton({ icon, label, onPress, isDisabled, tone }: {
  icon: React.ReactNode; label: string; onPress: () => void; isDisabled?: boolean;
  tone: { className?: string; style?: React.CSSProperties };
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isDisabled}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-1 text-center transition',
        'disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 active:scale-[0.98]',
        tone.className ?? '',
      ].join(' ')}
      style={tone.style}
    >
      {icon}
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

interface Props {
  online: boolean;
  cartHasItems: boolean;
  onQuickSale: () => void;
  onTableOrder: () => void;
  onPreInvoice: () => void;
  onCustomerOrder: () => void;
  onQuickSearch: () => void;
}

/**
 * نوار اکشن سریع سمت راست — هر دکمه به یک قابلیت واقعیِ همین صفحه وصل است،
 * نه یک ویژگی ساختگی: «پیش‌فاکتور» مثلاً چاپ رسید تازه‌ای با شمارهٔ رسمی نمی‌سازد
 * (که به شمارهٔ سریالی فاکتور رسمی/مالیاتی آسیب می‌زد)، فقط همان مودال بازبینی سفارش
 * پیش از ثبت را باز می‌کند.
 */
export function OrderQuickActionsRail({
  online, cartHasItems, onQuickSale, onTableOrder, onPreInvoice, onCustomerOrder, onQuickSearch,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="w-24 shrink-0 border-s border-border bg-surface p-2 flex flex-col gap-2 overflow-y-auto">
      <RailButton
        icon={<IconBolt className="h-5 w-5" />}
        label="فروش سریع"
        onPress={onQuickSale}
        tone={{ className: 'bg-accent text-accent-foreground' }}
      />
      <RailButton
        icon={<IconTable className="h-5 w-5" />}
        label="سفارش میز"
        onPress={onTableOrder}
        tone={{ style: { backgroundColor: 'oklch(0.55 0.18 300)', color: 'white' } }}
      />
      <RailButton
        icon={<IconReceipt className="h-5 w-5" />}
        label="پیش‌فاکتور"
        onPress={onPreInvoice}
        isDisabled={!cartHasItems}
        tone={{ className: 'bg-success text-success-foreground' }}
      />
      <RailButton
        icon={<IconUser className="h-5 w-5" />}
        label="سفارش مشتری"
        onPress={onCustomerOrder}
        tone={{ className: 'bg-warning text-warning-foreground' }}
      />
      <RailButton
        icon={<IconSearch className="h-5 w-5" />}
        label="جستجوی سریع"
        onPress={onQuickSearch}
        tone={{ style: { backgroundColor: 'oklch(0.62 0.11 175)', color: 'white' } }}
      />
      <div
        className={[
          'mt-auto flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-1 text-center',
          online ? 'bg-success text-success-foreground' : 'bg-danger text-danger-foreground',
        ].join(' ')}
        title={online ? 'اتصال به سرور برقرار است' : 'اتصال قطع است — حالت آفلاین'}
      >
        <IconWifi className="h-5 w-5" />
        <span className="text-[11px] font-semibold leading-tight">{online ? 'اتصال پایدار' : 'آفلاین'}</span>
        <span className="text-[10px] tabular-nums opacity-80">
          {now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </aside>
  );
}
