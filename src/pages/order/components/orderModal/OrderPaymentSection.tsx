import type { OrderModalState } from './shared';
import { Button } from '../../../../ui/compat-button';
import { Input } from '../../../../ui/compat-input';
import { formatPriceInput, normalizePriceInput } from './shared';

export interface OrderPaymentSectionProps {
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  setPaymentMethod: (method: 'cash' | 'card' | 'online' | 'mixed' | 'credit') => void;
  set: (patch: Partial<OrderModalState>) => void;
  showCashBoxSelector: boolean;
  state: OrderModalState;
  splitCash: number;
  setSplitCash: (amount: number) => void;
  splitCard: number;
  setSplitCard: (amount: number) => void;
  splitOnline: number;
  setSplitOnline: (amount: number) => void;
  paidNow: number;
  finalAmt: number;
  formatPrice: (price: number) => string;
  getSplitCreditAmount: () => number;
  isCardTerminalEnabled: boolean;
  canUseCardTerminal: boolean;
  allowDirectSendAmountToCardTerminal: boolean;
  onSendToCardTerminal: () => void;
  getFinalAmount: () => number;
  onCancelCardTerminal: () => void;
  onCardManualConfirm: () => void;
}

export function OrderPaymentSection({
  paymentMethod,
  setPaymentMethod,
  set,
  showCashBoxSelector,
  state,
  splitCash,
  setSplitCash,
  splitCard,
  setSplitCard,
  splitOnline,
  setSplitOnline,
  paidNow,
  finalAmt,
  formatPrice,
  getSplitCreditAmount,
  isCardTerminalEnabled,
  canUseCardTerminal,
  allowDirectSendAmountToCardTerminal,
  onSendToCardTerminal,
  getFinalAmount,
  onCancelCardTerminal,
  onCardManualConfirm,
}: OrderPaymentSectionProps) {
  return (
    <>
      {/* Payment method + Cash box */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">روش پرداخت</span>
          <div className="flex gap-1.5 flex-nowrap">
            {(
              [
                ['cash', 'نقد'],
                ['card', 'کارت'],
                ['online', 'آنلاین'],
                ['mixed', 'ترکیبی'],
                ['credit', 'اعتباری (نسیه)'],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={paymentMethod === key ? 'solid' : 'bordered'}
                color="primary"
                className="shrink px-2 text-xs whitespace-nowrap min-w-0"
                onPress={() => {
                  setPaymentMethod(key as any);
                  if (key !== 'card')
                    set({
                      cardTerminalStatus: 'idle',
                      cardTerminalError: '',
                      cardTerminalRefId: '',
                    });
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {showCashBoxSelector && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">صندوق</span>
            <div className="flex gap-1.5 flex-wrap">
              {state.cashBoxAccounts.map((acc) => (
                <Button
                  key={acc.id}
                  size="sm"
                  variant={state.selectedCashBoxId === acc.id ? 'solid' : 'bordered'}
                  color="primary"
                  className="shrink px-2 text-xs whitespace-nowrap min-w-0"
                  onPress={() =>
                    set({
                      selectedCashBoxId: acc.id,
                      selectedCashBoxName: acc.name || 'صندوق',
                    })
                  }
                >
                  {acc.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mixed payment */}
      {(paymentMethod === 'mixed' || paymentMethod === 'credit') && (
        <div
          className={`rounded-lg border p-3 flex flex-col gap-3 ${paymentMethod === 'credit' ? 'border-warning/30 bg-warning-soft' : 'border-border bg-default-soft'}`}
        >
          <p className="text-sm font-semibold text-foreground">
            تقسیم پرداخت{paymentMethod === 'credit' ? ' — نسیه' : ''}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['نقد', splitCash, setSplitCash],
              ['کارت', splitCard, setSplitCard],
              ['آنلاین', splitOnline, setSplitOnline],
            ].map(([label, val, setter]) => (
              <Input
                key={label as string}
                label={`${label} (ریال)`}
                value={(val as number) > 0 ? formatPriceInput(String(val)) : ''}
                onChange={(e) =>
                  (setter as Function)(Number(normalizePriceInput(e.target.value)) || 0)
                }
                placeholder="0"
                type="text"
                inputMode="numeric"
                size="sm"
                variant="bordered"
                classNames={{ input: 'text-center' }}
              />
            ))}
          </div>
          <div
            className={`rounded-lg p-2.5 text-sm flex flex-col gap-1 ${paidNow > finalAmt ? 'bg-danger-soft border border-danger/40' : 'bg-surface border border-border'}`}
          >
            {paidNow > 0 && (
              <div className="flex justify-between text-foreground/70">
                <span>پرداخت‌شده</span>
                <span className="text-success-soft-foreground font-semibold">
                  {formatPrice(paidNow)}
                </span>
              </div>
            )}
            {paymentMethod === 'credit' ? (
              <div className="flex justify-between font-semibold">
                <span
                  className={
                    getSplitCreditAmount() > 0 ? 'text-danger' : 'text-success-soft-foreground'
                  }
                >
                  {getSplitCreditAmount() > 0 ? 'اعتباری (نسیه)' : 'کل پرداخت شد ✓'}
                </span>
                <span
                  className={
                    getSplitCreditAmount() > 0 ? 'text-danger' : 'text-success-soft-foreground'
                  }
                >
                  {formatPrice(getSplitCreditAmount())}
                </span>
              </div>
            ) : (
              <div
                className={`flex justify-between font-semibold ${paidNow > finalAmt ? 'text-danger' : Math.max(0, finalAmt - paidNow) > 0 ? 'text-warning-soft-foreground' : 'text-success-soft-foreground'}`}
              >
                <span>
                  {paidNow > finalAmt
                    ? '⚠ بیشتر از مبلغ'
                    : Math.max(0, finalAmt - paidNow) > 0
                      ? 'نسیه (اعتباری)'
                      : '✓ کامل پرداخت شد'}
                </span>
                <span>
                  {formatPrice(
                    paidNow > finalAmt ? paidNow - finalAmt : Math.max(0, finalAmt - paidNow),
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card terminal */}
      {paymentMethod === 'card' &&
        isCardTerminalEnabled &&
        canUseCardTerminal &&
        allowDirectSendAmountToCardTerminal && (
          <div className="rounded-xl border border-border bg-default-soft p-3 flex flex-col gap-3 text-sm">
            <p className="font-medium text-foreground">پرداخت کارتخوان</p>
            {state.cardTerminalProfiles.length > 1 && state.cardTerminalStatus === 'idle' && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">انتخاب کارتخوان</span>
                <div className="flex gap-1.5 flex-wrap">
                  {state.cardTerminalProfiles.map((t) => (
                    <Button
                      key={t.id}
                      size="sm"
                      variant={state.selectedCardTerminalId === t.id ? 'solid' : 'bordered'}
                      color="primary"
                      className="shrink px-2 text-xs whitespace-nowrap min-w-0"
                      onPress={() => set({ selectedCardTerminalId: t.id })}
                    >
                      {t.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {state.cardTerminalStatus === 'idle' && (
              <Button color="primary" size="sm" onPress={onSendToCardTerminal}>
                ارسال {formatPrice(getFinalAmount())} به کارتخوان
              </Button>
            )}
            {state.cardTerminalStatus === 'sending' && (
              <div className="flex items-center justify-between gap-2 text-accent-soft-foreground py-1">
                <div className="flex items-center gap-2">
                  <span className="animate-spin text-base">⏳</span>
                  <span>در حال ارتباط با کارتخوان — لطفاً کارت بکشید...</span>
                </div>
                <Button size="sm" variant="flat" color="danger" onPress={onCancelCardTerminal}>
                  لغو
                </Button>
              </div>
            )}
            {state.cardTerminalStatus === 'approved' && (
              <div className="flex items-center gap-2 text-success-soft-foreground py-1">
                <span className="text-base">✅</span>
                <span>
                  کارتخوان تأیید کرد، در حال ثبت سفارش...
                  {state.cardTerminalRefId && (
                    <span className="text-xs text-muted mr-2">
                      (Ref: {state.cardTerminalRefId})
                    </span>
                  )}
                </span>
              </div>
            )}
            {state.cardTerminalStatus === 'failed' && (
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger-soft-foreground text-xs">
                  ⚠ {state.cardTerminalError || 'کارتخوان جواب نداد یا خطا رخ داد.'}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => set({ cardTerminalStatus: 'idle', cardTerminalError: '' })}
                  >
                    تلاش مجدد
                  </Button>
                  <Button size="sm" color="warning" onPress={onCardManualConfirm}>
                    ثبت دستی — کارت کشیده شد
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
}
