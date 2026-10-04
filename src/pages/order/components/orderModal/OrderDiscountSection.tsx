import type { DiscountType } from '../../../../types';
import type { AppliedDiscountCode } from '../../../../store/orderStore';
import type { OrderModalState } from './shared';
import type { PointsRewardOption } from '../../../../services/api';
import { Wallet as WalletIcon } from 'lucide-react';
import { Button } from '../../../../ui/compat-button';
import { Input } from '../../../../ui/compat-input';
import { Select, SelectItem } from '../../../../ui/compat-select';
import { formatPriceInput, normalizePriceInput } from './shared';

export interface OrderDiscountSectionProps {
  discountType: DiscountType;
  canUseDiscountCode: boolean;
  setDiscountType: (type: DiscountType) => void;
  appliedDiscountCode: AppliedDiscountCode | null;
  state: OrderModalState;
  discountCode: string;
  setDiscountCode: (code: string) => void;
  set: (patch: Partial<OrderModalState>) => void;
  setAppliedDiscountCode: (applied: AppliedDiscountCode | null) => void;
  handleApplyDiscountCode: (codeOverride?: string) => Promise<void>;
  formatPrice: (price: number) => string;
  discountAmount: number;
  setDiscountAmount: (amount: number) => void;
  getDiscountAmount: () => number;
  cashbackRedeemAmount: number;
  getFinalAmount: () => number;
  setCashbackRedeemAmount: (amount: number) => void;
  handleRedeemReward: (tier: PointsRewardOption) => Promise<void>;
}

export function OrderDiscountSection({
  discountType,
  canUseDiscountCode,
  setDiscountType,
  appliedDiscountCode,
  state,
  discountCode,
  setDiscountCode,
  set,
  setAppliedDiscountCode,
  handleApplyDiscountCode,
  formatPrice,
  discountAmount,
  setDiscountAmount,
  getDiscountAmount,
  cashbackRedeemAmount,
  getFinalAmount,
  setCashbackRedeemAmount,
  handleRedeemReward,
}: OrderDiscountSectionProps) {
  return (
    <>
      {/* Discount */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">تخفیف</span>
        <div className="flex gap-2 flex-wrap">
          {(['percentage', 'fixed', 'code'] as const).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={discountType === type ? 'solid' : 'bordered'}
              color="primary"
              isDisabled={type === 'code' && !canUseDiscountCode}
              onPress={() =>
                type !== 'code' || canUseDiscountCode ? setDiscountType(type) : undefined
              }
            >
              {type === 'percentage' ? 'درصدی' : type === 'fixed' ? 'ریالی' : 'کد تخفیف'}
            </Button>
          ))}
        </div>
        {discountType === 'code' ? (
          <div className="flex flex-col gap-2">
            {!appliedDiscountCode && state.availableDiscountCodes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted font-medium">کدهای تخفیف این مشتری</span>
                <div className="flex flex-wrap gap-1.5">
                  {state.availableDiscountCodes.map((dc) => (
                    <button
                      key={dc.id}
                      type="button"
                      className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-right transition cursor-pointer ${discountCode.toUpperCase() === dc.code.toUpperCase() ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-default-soft hover:border-accent text-foreground'}`}
                      onClick={async () => {
                        setDiscountCode(dc.code);
                        set({ discountCodeError: '' });
                        setAppliedDiscountCode(null);
                        await handleApplyDiscountCode(dc.code);
                      }}
                    >
                      <span className="font-mono font-bold text-xs tracking-wider">{dc.code}</span>
                      <span className="text-xs mt-0.5 text-muted">
                        {dc.type === 'percentage' ? `${dc.value}٪` : formatPrice(dc.value)} تخفیف
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-end">
              <Input
                type="text"
                placeholder="کد تخفیف"
                value={discountCode}
                onValueChange={(v) => {
                  setDiscountCode(v);
                  set({ discountCodeError: '' });
                }}
                isDisabled={!!appliedDiscountCode}
                variant="bordered"
                classNames={{ input: 'text-right uppercase' }}
              />
              {!appliedDiscountCode ? (
                <Button
                  size="sm"
                  color="primary"
                  onPress={() => handleApplyDiscountCode()}
                  isDisabled={!discountCode.trim()}
                >
                  ثبت
                </Button>
              ) : (
                <>
                  <span className="text-success text-sm">
                    تخفیف: {formatPrice(appliedDiscountCode.discountAmount)}
                  </span>
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    onPress={() => {
                      setAppliedDiscountCode(null);
                      setDiscountCode('');
                      set({ discountCodeError: '' });
                    }}
                  >
                    لغو
                  </Button>
                </>
              )}
            </div>
            {state.discountCodeError && (
              <small className="text-danger text-xs">{state.discountCodeError}</small>
            )}
          </div>
        ) : (
          <>
            <Input
              type={discountType === 'fixed' ? 'text' : 'number'}
              inputMode={discountType === 'fixed' ? 'numeric' : undefined}
              min={0}
              max={discountType === 'percentage' ? 100 : undefined}
              placeholder={discountType === 'percentage' ? 'مثال: 10' : 'مثال: 50,000'}
              value={
                discountType === 'fixed'
                  ? discountAmount
                    ? formatPriceInput(String(discountAmount))
                    : ''
                  : discountAmount
                    ? String(discountAmount)
                    : ''
              }
              onValueChange={(v) =>
                setDiscountAmount(
                  discountType === 'fixed' ? Number(normalizePriceInput(v)) || 0 : Number(v) || 0,
                )
              }
              endContent={
                discountType === 'fixed' ? (
                  <span className="text-muted text-sm whitespace-nowrap">ریال</span>
                ) : undefined
              }
              variant="bordered"
              classNames={{ input: 'text-right' }}
            />
            {getDiscountAmount() > 0 && (
              <small className="text-muted">مبلغ تخفیف: {formatPrice(getDiscountAmount())}</small>
            )}
          </>
        )}
      </div>

      {/* کیف پول کش‌بک — مختص همین رستوران، فقط با شماره مشتری معتبر نمایش داده می‌شود */}
      {state.cashbackBalance > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success-soft p-3">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-sm font-medium text-success-soft-foreground">
              <WalletIcon className="h-4 w-4" aria-hidden />
              موجودی کیف پول کش‌بک مشتری
            </span>
            <span className="text-sm font-bold text-success-soft-foreground">
              {formatPrice(state.cashbackBalance)}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="چقدر استفاده شود؟"
              value={cashbackRedeemAmount ? formatPriceInput(String(cashbackRedeemAmount)) : ''}
              onValueChange={(v) => {
                const requested = Number(normalizePriceInput(v)) || 0;
                const cap = Math.min(
                  state.cashbackBalance,
                  getFinalAmount() + cashbackRedeemAmount,
                );
                setCashbackRedeemAmount(Math.min(requested, cap));
              }}
              endContent={<span className="text-muted text-sm whitespace-nowrap">ریال</span>}
              variant="bordered"
              classNames={{ input: 'text-right' }}
            />
            <Button
              size="sm"
              variant="flat"
              color="primary"
              onPress={() =>
                setCashbackRedeemAmount(
                  Math.min(state.cashbackBalance, getFinalAmount() + cashbackRedeemAmount),
                )
              }
            >
              استفاده همه
            </Button>
            {cashbackRedeemAmount > 0 && (
              <Button
                size="sm"
                variant="flat"
                color="danger"
                onPress={() => setCashbackRedeemAmount(0)}
              >
                انصراف
              </Button>
            )}
          </div>
        </div>
      )}

      {/* کاتالوگ جوایز امتیازی — مشتری با موجودی امتیازش می‌تواند اینجا یک جایزه بگیرد؛
              با گرفتن جایزه، یک کد تخفیف یک‌بارمصرف ساخته و بلافاصله روی همین سفارش اعمال می‌شود */}
      {state.pointsBalance > 0 && state.availableRewards.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-warning-soft-foreground">
              موجودی امتیاز مشتری
            </span>
            <span className="text-sm font-bold text-warning-soft-foreground">
              {state.pointsBalance.toLocaleString('fa-IR')} امتیاز
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {state.availableRewards.map((tier) => (
              <div
                key={tier.id}
                className="flex flex-col gap-2 rounded-md bg-surface-secondary border border-warning/20 p-2"
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{tier.title}</span>
                    <span className="text-xs text-muted">
                      {tier.pointsCost.toLocaleString('fa-IR')} امتیاز
                      {tier.rewardType === 'free_specific_item' && tier.product
                        ? ` — ${tier.product.name}`
                        : ''}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    color="warning"
                    variant="flat"
                    isDisabled={!tier.eligible || state.redeemingTierId === tier.id}
                    onPress={() => handleRedeemReward(tier)}
                  >
                    {state.redeemingTierId === tier.id ? '...' : 'دریافت جایزه'}
                  </Button>
                </div>
                {tier.rewardType === 'free_item_category' && !!tier.products?.length && (
                  <Select
                    label={`انتخاب محصول از ${tier.category?.name ?? 'این دسته'}`}
                    selectedKeys={
                      state.selectedProductByTier[tier.id]
                        ? [String(state.selectedProductByTier[tier.id])]
                        : []
                    }
                    onSelectionChange={(keys) => {
                      const selected = Number(Array.from(keys as Set<string>)[0]);
                      set({
                        selectedProductByTier: {
                          ...state.selectedProductByTier,
                          [tier.id]: selected,
                        },
                      });
                    }}
                  >
                    {tier.products.map((product) => (
                      <SelectItem key={String(product.id)} value={String(product.id)}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
