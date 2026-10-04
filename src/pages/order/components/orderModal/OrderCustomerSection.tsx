import type { RefObject } from 'react';
import type { OrderModalState } from './shared';
import type { WheelPrizeVoucher } from '../../../../services/api';
import { Button } from '../../../../ui/compat-button';
import { Input } from '../../../../ui/compat-input';
import { sanitizeMobileInput, isValidIranMobile } from '../../../../utils/iranMobile';
import { toShamsiDate } from '../../../../utils/date';

export interface OrderCustomerSectionProps {
  phoneInputRef: RefObject<HTMLInputElement | null>;
  isMobileRequired: boolean;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  set: (patch: Partial<OrderModalState>) => void;
  state: OrderModalState;
  handleCheckUser: () => Promise<void>;
  handleApplyWheelVoucher: (voucher: WheelPrizeVoucher) => Promise<void>;
}

export function OrderCustomerSection({
  phoneInputRef,
  isMobileRequired,
  customerPhone,
  setCustomerPhone,
  set,
  state,
  handleCheckUser,
  handleApplyWheelVoucher,
}: OrderCustomerSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        ref={phoneInputRef}
        label={`شماره تماس ${isMobileRequired ? '(اجباری)' : ''}`}
        placeholder="09123456789"
        value={customerPhone}
        onValueChange={(v) => {
          setCustomerPhone(sanitizeMobileInput(v));
          set({
            userExists: null,
            loadedCustomerFirstName: '',
            loadedCustomerLastName: '',
            customerFirstNameInput: '',
            customerLastNameInput: '',
            showCustomerNameFields: false,
            wheelVouchers: [],
            referralCode: '',
          });
        }}
        autoComplete="tel"
        inputMode="numeric"
        variant="bordered"
        isInvalid={customerPhone.length > 0 && !isValidIranMobile(customerPhone)}
        errorMessage={
          customerPhone.length > 0 && !isValidIranMobile(customerPhone)
            ? 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود'
            : undefined
        }
        endContent={
          <Button
            size="sm"
            isDisabled={state.isCheckingUser || !customerPhone.trim()}
            onPress={handleCheckUser}
          >
            {state.isCheckingUser ? '...' : '✓'}
          </Button>
        }
        classNames={{ input: 'text-right' }}
      />

      {state.userExists === true && (
        <span className="text-success text-sm">
          {[state.loadedCustomerFirstName, state.loadedCustomerLastName]
            .filter(Boolean)
            .join(' ')
            .trim() || 'مشتری ثبت‌نام شده'}
        </span>
      )}

      {(state.userExists === true || state.showCustomerNameFields) && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-default-soft border border-border">
          <span className="text-foreground/80 text-sm font-medium">نام مشتری (اختیاری)</span>
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <Input
              placeholder="نام"
              value={state.customerFirstNameInput}
              onValueChange={(v) => set({ customerFirstNameInput: v })}
              size="sm"
              variant="bordered"
              classNames={{ input: 'text-right' }}
            />
            <Input
              placeholder="نام خانوادگی"
              value={state.customerLastNameInput}
              onValueChange={(v) => set({ customerLastNameInput: v })}
              size="sm"
              variant="bordered"
              classNames={{ input: 'text-right' }}
            />
          </div>
        </div>
      )}

      {state.userExists === false && (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-warning-soft border border-warning/30">
          <span className="text-warning-soft-foreground text-sm font-medium">مشتری جدید</span>
          <Button
            size="sm"
            color="primary"
            isDisabled={state.showCustomerNameFields}
            onPress={() => set({ showCustomerNameFields: true })}
          >
            {state.showCustomerNameFields ? 'نام مشتری را وارد کنید' : 'افزودن به مشتریان'}
          </Button>
          {state.referralAvailable && (
            <Input
              size="sm"
              label="کد معرف داره؟"
              placeholder="مثلاً REF-9F3K"
              value={state.referralCode}
              onValueChange={(v) => set({ referralCode: v })}
              variant="bordered"
              classNames={{ input: 'text-right' }}
            />
          )}
        </div>
      )}

      {/* Wheel vouchers */}
      {state.wheelVouchers.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3"
          dir="rtl"
        >
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: 18 }}>🎡</span>
            <span className="text-sm font-bold text-warning-soft-foreground">
              جوایز گردونه شانس ({state.wheelVouchers.length})
            </span>
          </div>
          {state.wheelVouchers.map((v) => {
            const prizeLabel =
              v.prizeType === 'discount_percent'
                ? `${v.prizeData?.percent ?? 0}٪ تخفیف`
                : v.prizeType === 'discount_amount'
                  ? `${Number(v.prizeData?.amount ?? 0).toLocaleString('fa-IR')} ریال تخفیف`
                  : v.prizeType === 'free_product'
                    ? `کالای رایگان: ${v.prizeData?.productName ?? ''}`
                    : `${v.prizeData?.points ?? 0} امتیاز`;
            return (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface border border-warning/20 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{prizeLabel}</span>
                  {v.expiresAt && (
                    <span className="text-xs text-warning">انقضا: {toShamsiDate(v.expiresAt)}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  color="warning"
                  isLoading={state.applyingVoucher === v.id}
                  onPress={() => handleApplyWheelVoucher(v)}
                  className="shrink-0 font-bold"
                >
                  اعمال
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
