import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCallerIdStore } from '../store/callerIdStore';
import { useAuthStore } from '../store/authStore';

function formatPhone(phone: string): string {
  if (phone.length === 11 && phone.startsWith('0')) {
    return `${phone.slice(0, 4)}-${phone.slice(4, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fa-IR').format(amount) + ' تومان';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function CallTimer({ startIso }: { startIso: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startIso).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return <span className="text-xs font-mono text-green-300 tabular-nums">{m}:{s}</span>;
}

export function CallerIdOverlay() {
  const navigate = useNavigate();
  const { activeCall, dismissCall, createNewOrder, addCallerAsCustomer, settings } = useCallerIdStore();
  const { token, user } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ?? null;

  const [showAddForm, setShowAddForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!activeCall) {
      setShowAddForm(false);
      setFirstName('');
      setLastName('');
      setAddError(null);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      return;
    }

    if (settings?.playSoundEnabled) {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.src = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2s3ASNrp9Hfq3BCIBpPjcPcqX5PIChmoNjfs4xeLBlHg7nitoxwSx9Ei7vksZNyWCFLlM7quJl3WiBPntfvwJ+AYiVVpN/0yKWHaSxarOn4z6mMbyxfr+/8062PdCxiqe//0K6SeTFms///1LSXgDdtqv//2LedijdyqP//3cGjkDt6pP//4s2tlz+Dp///5dWvnkGIqP//6N2wnkOLqv//7OOymEWPrP//8emznkiSrv//9e60n0iSsP//+PK2nEqTsf//+vW3mEuWsv///fW4lk2Wsf///fW3lk6Xsf///fW3lE6Xsf///PW2kk+Wsf///PW2kk+Wsf///A==";
          audioRef.current.loop = true;
        }
        audioRef.current.play().catch(() => {});
      } catch {}
    }

    const duration = (settings?.notifyDurationSec ?? 30) * 1000;
    dismissTimerRef.current = setTimeout(() => {
      dismissCall();
    }, duration);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [activeCall?.phone]);

  if (!activeCall) return null;

  const { phone, timestamp, lookupResult, isLoading } = activeCall;
  const isKnown = lookupResult?.isKnown ?? false;
  const customer = lookupResult?.customer ?? null;
  const displayName = customer
    ? `${customer.firstName} ${customer.lastName}`.trim() || phone
    : null;

  const handleDismiss = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    dismissCall();
  };

  const handleCreateOrder = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    createNewOrder(navigate);
  };

  const handleAddCustomer = async () => {
    if (!token || !restaurantId) return;
    setAddingCustomer(true);
    setAddError(null);
    const result = await addCallerAsCustomer(restaurantId, token, firstName, lastName);
    setAddingCustomer(false);
    if (result.success) {
      setShowAddForm(false);
    } else {
      setAddError(result.error ?? 'خطای ناشناخته');
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-6 left-6 z-[9999] w-96 max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl
                 bg-gray-900 border border-gray-700 flex flex-col gap-0
                 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ fontFamily: 'inherit' }}
    >
      {/* Header — ringing indicator */}
      <div className="relative flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-800 to-emerald-700 rounded-t-2xl overflow-hidden">
        {/* Pulse rings */}
        <span className="absolute -right-2 -top-2 w-20 h-20 rounded-full bg-green-500/20 animate-ping" />
        <span className="absolute -right-1 -top-1 w-14 h-14 rounded-full bg-green-500/30 animate-ping [animation-delay:200ms]" />

        <div className="relative shrink-0 w-12 h-12 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-300 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24
              1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17
              0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-green-200 font-medium">تماس ورودی</p>
          <p className="text-lg font-bold text-white tracking-wider truncate">{formatPhone(phone)}</p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <CallTimer startIso={timestamp} />
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="رد کردن"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-4 text-gray-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm">در حال جستجوی مشتری…</span>
          </div>
        )}

        {!isLoading && lookupResult && (
          <>
            {/* Customer info */}
            <div className={`rounded-xl p-3 flex items-center gap-3 ${isKnown ? 'bg-blue-900/40 border border-blue-700/50' : 'bg-gray-800/60 border border-gray-700/50'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0
                ${isKnown ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-400'}`}>
                {displayName ? displayName[0] : '؟'}
              </div>
              <div className="flex-1 min-w-0">
                {isKnown ? (
                  <>
                    <p className="font-semibold text-white truncate">{displayName ?? phone}</p>
                    <p className="text-xs text-gray-400">مشتری شناخته‌شده</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-gray-300">شماره جدید</p>
                    <p className="text-xs text-gray-500">اولین تماس از این شماره</p>
                  </>
                )}
              </div>
              {isKnown && (
                <div className="text-left shrink-0">
                  <p className="text-xs text-blue-300 font-semibold">{lookupResult.totalOrders} سفارش</p>
                  <p className="text-xs text-gray-400">{formatCurrency(lookupResult.totalSpent)}</p>
                </div>
              )}
            </div>

            {/* Recent orders */}
            {lookupResult.recentOrders.length > 0 && (
              <div className="rounded-xl bg-gray-800/40 border border-gray-700/40 overflow-hidden">
                <p className="text-xs font-semibold text-gray-400 px-3 py-2 border-b border-gray-700/40">
                  آخرین سفارش‌ها
                </p>
                <div className="divide-y divide-gray-700/40">
                  {lookupResult.recentOrders.slice(0, 3).map((order) => (
                    <div key={order.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="text-xs text-white font-mono">#{order.orderNumber}</p>
                        <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-gray-300">{formatCurrency(order.totalAmount)}</p>
                        <p className={`text-xs font-medium ${
                          order.status === 'completed' || order.status === 'delivered'
                            ? 'text-green-400'
                            : order.status === 'cancelled'
                              ? 'text-red-400'
                              : 'text-yellow-400'
                        }`}>
                          {order.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Addresses */}
            {lookupResult.addresses.length > 0 && (
              <div className="rounded-xl bg-gray-800/40 border border-gray-700/40 overflow-hidden">
                <p className="text-xs font-semibold text-gray-400 px-3 py-2 border-b border-gray-700/40">
                  آدرس‌ها
                </p>
                <div className="divide-y divide-gray-700/40">
                  {lookupResult.addresses.map((addr) => (
                    <div key={addr.id} className="flex items-start gap-2 px-3 py-2">
                      {addr.isDefault && (
                        <span className="shrink-0 mt-0.5 text-yellow-400">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        {addr.label && (
                          <p className="text-xs text-gray-400 font-medium">{addr.label}</p>
                        )}
                        <p className="text-xs text-gray-300 break-words">{addr.address}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add to customers form (new callers) */}
            {!isKnown && (
              <div className="rounded-xl bg-yellow-900/20 border border-yellow-700/30">
                {!showAddForm ? (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-yellow-300 hover:bg-yellow-800/20 rounded-xl transition-colors text-sm"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    افزودن به لیست مشتریان
                  </button>
                ) : (
                  <div className="p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-yellow-300">افزودن مشتری جدید</p>
                    <div className="flex gap-2">
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="نام"
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      />
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="نام خانوادگی"
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      />
                    </div>
                    {addError && <p className="text-xs text-red-400">{addError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddCustomer}
                        disabled={addingCustomer}
                        className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      >
                        {addingCustomer ? 'در حال ذخیره…' : 'ذخیره'}
                      </button>
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleCreateOrder}
            className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-500
                       text-white rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            ثبت سفارش
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700
                       rounded-xl transition-colors border border-gray-700"
          >
            رد
          </button>
        </div>
      </div>
    </div>
  );
}
