import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Chip } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { useCallerIdStore } from '../store/callerIdStore';
import { toShamsiShort, toShamsiTime } from '../utils/date';

function formatPhone(phone: string): string {
  if (phone.length === 11 && phone.startsWith('0')) {
    return `${phone.slice(0, 4)}-${phone.slice(4, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

function formatDateTime(iso: string): string {
  const date = toShamsiShort(iso);
  const time = toShamsiTime(iso);
  return `${date} — ${time}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fa-IR').format(amount) + ' ت';
}

type KnownFilter = 'all' | 'known' | 'new';
type DateFilter = 'all' | 'today' | 'week';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d >= new Date(n.getTime() - 7 * 24 * 60 * 60 * 1000) && d <= n;
}

function normalizeSearch(s: string): string {
  return s.trim().replace(/-/g, '').replace(/\s+/g, ' ');
}

export default function CallHistoryPage() {
  const navigate = useNavigate();
  const { callHistory } = useCallerIdStore();

  const [search, setSearch] = useState('');
  const [knownFilter, setKnownFilter] = useState<KnownFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const filtered = useMemo(() => {
    const q = normalizeSearch(search).toLowerCase();
    return callHistory.filter((call) => {
      const isKnown = call.lookupResult?.isKnown ?? false;
      const customer = call.lookupResult?.customer ?? null;
      const displayName = customer
        ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
        : '';

      if (knownFilter === 'known' && !isKnown) return false;
      if (knownFilter === 'new' && isKnown) return false;
      if (dateFilter === 'today' && !isToday(call.timestamp)) return false;
      if (dateFilter === 'week' && !isThisWeek(call.timestamp)) return false;

      if (q) {
        const phoneNorm = normalizeSearch(call.phone).toLowerCase();
        if (!phoneNorm.includes(q) && !displayName.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [callHistory, search, knownFilter, dateFilter]);

  const handleOrder = (phone: string, lookupResult: any) => {
    const name = lookupResult?.customer
      ? `${lookupResult.customer.firstName} ${lookupResult.customer.lastName}`.trim()
      : '';
    const address = lookupResult?.addresses?.find((a: any) => a.isDefault)?.address
      ?? lookupResult?.addresses?.[0]?.address
      ?? '';
    navigate('/order', { state: { prefill: { customerPhone: phone, customerName: name, customerAddress: address } } });
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="flat" size="sm" onPress={() => navigate(-1)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            بازگشت
          </Button>
          <div>
            <h1 className="text-xl font-bold">تاریخچه تماس‌ها</h1>
            <p className="text-xs text-muted">{callHistory.length} تماس ذخیره‌شده</p>
          </div>
        </div>

        {/* Search + Filters */}
        <Card>
          <CardContent className="gap-3">
            <Input
              placeholder="جستجو بر اساس شماره یا نام..."
              value={search}
              onValueChange={setSearch}
              startContent={
                <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              }
              endContent={
                search ? (
                  <button onClick={() => setSearch('')} className="text-muted hover:text-foreground/70">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : undefined
              }
            />

            <div className="flex flex-wrap gap-2">
              {/* known filter */}
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'known', 'new'] as KnownFilter[]).map((v) => (
                  <Chip
                    key={v}
                    size="sm"
                    variant={knownFilter === v ? 'solid' : 'flat'}
                    color={knownFilter === v ? 'primary' : 'default'}
                    className="cursor-pointer select-none"
                    onClick={() => setKnownFilter(v)}
                  >
                    {v === 'all' ? 'همه' : v === 'known' ? 'مشتری شناخته‌شده' : 'شماره جدید'}
                  </Chip>
                ))}
              </div>

              <div className="w-px bg-default self-stretch hidden sm:block" />

              {/* date filter */}
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'today', 'week'] as DateFilter[]).map((v) => (
                  <Chip
                    key={v}
                    size="sm"
                    variant={dateFilter === v ? 'solid' : 'flat'}
                    color={dateFilter === v ? 'primary' : 'default'}
                    className="cursor-pointer select-none"
                    onClick={() => setDateFilter(v)}
                  >
                    {v === 'all' ? 'تمام دوره' : v === 'today' ? 'امروز' : 'هفت روز اخیر'}
                  </Chip>
                ))}
              </div>
            </div>

            {filtered.length !== callHistory.length && (
              <p className="text-xs text-muted">
                نمایش {filtered.length} از {callHistory.length} تماس
              </p>
            )}
          </CardContent>
        </Card>

        {/* Empty state — no calls at all */}
        {callHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36
                   1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1
                   1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2
                   2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
            <p className="text-base">هنوز تماسی ثبت نشده</p>
            <p className="text-xs mt-1 opacity-60">تماس‌های ورودی اینجا نگه‌داشته می‌شوند</p>
          </div>
        )}

        {/* Empty state — filter has no results */}
        {callHistory.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <p className="text-base">نتیجه‌ای یافت نشد</p>
            <p className="text-xs mt-1 opacity-60">فیلتر یا کلیدواژه جستجو را تغییر دهید</p>
          </div>
        )}

        {/* List */}
        {filtered.length > 0 && (
          <Card>
            <CardContent className="gap-2 p-3">
              {filtered.map((call, idx) => {
                const customer = call.lookupResult?.customer ?? null;
                const isKnown = call.lookupResult?.isKnown ?? false;
                const displayName = customer
                  ? `${customer.firstName} ${customer.lastName}`.trim()
                  : null;

                return (
                  <div
                    key={`${call.phone}-${call.timestamp}-${idx}`}
                    className="rounded-xl border border-border bg-default-soft p-3 flex items-center gap-3"
                  >
                    {/* Avatar */}
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      ${isKnown
                        ? 'bg-accent-soft text-accent-soft-foreground dark:bg-accent/40 dark:text-accent/70'
                        : 'bg-default text-muted'}`}>
                      {displayName ? displayName[0] : '📞'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm tracking-wider">
                          {formatPhone(call.phone)}
                        </span>
                        {isKnown && displayName && (
                          <span className="text-xs text-accent dark:text-accent/80 font-medium truncate">
                            {displayName}
                          </span>
                        )}
                        {!isKnown && call.lookupResult && (
                          <Chip size="sm" variant="flat" color="default" className="text-[10px]">
                            شماره جدید
                          </Chip>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">{formatDateTime(call.timestamp)}</p>
                      {isKnown && call.lookupResult && (
                        <p className="text-xs text-muted mt-0.5">
                          {call.lookupResult.totalOrders} سفارش
                          {call.lookupResult.totalSpent > 0 && ` · ${formatCurrency(call.lookupResult.totalSpent)}`}
                        </p>
                      )}
                    </div>

                    {/* Action */}
                    <Button
                      size="sm"
                      color="success"
                      variant="flat"
                      onPress={() => handleOrder(call.phone, call.lookupResult)}
                    >
                      ثبت سفارش
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
