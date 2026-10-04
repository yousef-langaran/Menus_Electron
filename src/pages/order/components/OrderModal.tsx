import type { OrderModalState } from './orderModal/shared';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { LockKeyhole, Sparkles } from 'lucide-react';
import { Button } from '../../../ui/compat-button';
import { Textarea } from '../../../ui/compat-textarea';
import { ModalShell } from '../../../ui/modal-shell';
import { CheckboxCompat as Checkbox } from '../../../ui/compat-checkbox';
import { useOrderStore } from '../../../store/orderStore';
import { usePrinterSettingsStore } from '../../../store/printerSettingsStore';
import { useAuthStore } from '../../../store/authStore';
import { OrderCart } from './OrderCart';
export type { OrderModalState } from './orderModal/shared';
import { OrderCustomerSection } from './orderModal/OrderCustomerSection';
import { OrderServiceSection } from './orderModal/OrderServiceSection';
import { OrderPaymentSection } from './orderModal/OrderPaymentSection';
import { OrderDiscountSection } from './orderModal/OrderDiscountSection';
import { useOrderModalState } from './orderModal/useOrderModalState';

interface Props {
  state: OrderModalState;
  setState: React.Dispatch<React.SetStateAction<OrderModalState>>;
  editingOrderId: number | null;
  isMobileRequired: boolean;
  isCardTerminalEnabled: boolean;
  allowDirectSendAmountToCardTerminal: boolean;
  canUseCardTerminal: boolean;
  formatPrice: (price: number) => string;
  cartItemOptions: string[];
  onSubmit: () => void;
  onSendToCardTerminal: () => void;
  onCardManualConfirm: () => void;
  onCancelCardTerminal: () => void;
  onClose: () => void;
}

export function OrderModal({
  state,
  setState,
  editingOrderId,
  isMobileRequired,
  isCardTerminalEnabled,
  allowDirectSendAmountToCardTerminal,
  canUseCardTerminal,
  formatPrice,
  cartItemOptions,
  onSubmit,
  onSendToCardTerminal,
  onCardManualConfirm,
  onCancelCardTerminal,
  onClose,
}: Props) {
  const { user, token } = useAuthStore();
  const {
    cart,
    customerPhone,
    serviceType,
    tableNumber,
    tableId,
    customerAddress,
    paymentMethod,
    notes,
    deliveryLocation,
    deliveryFeeOverride,
    discountType,
    discountCode,
    appliedDiscountCode,
    discountAmount,
    isSubmitting,
    cashbackRedeemAmount,
    splitCash,
    splitCard,
    splitOnline,
    setCustomerPhone,
    setServiceType,
    setTableNumber,
    setTable,
    setCustomerAddress,
    setDeliveryLocation,
    setDeliveryFeeOverride,
    setDeliveryFeeReason,
    setPaymentMethod,
    setNotes,
    setDiscountAmount,
    setDiscountType,
    setDiscountCode,
    setAppliedDiscountCode,
    setCashbackRedeemAmount,
    setSplitCash,
    setSplitCard,
    setSplitOnline,
    getSplitCreditAmount,
    getTotalAmount,
    getFinalAmount,
    getDiscountAmount,
    getVatAmount,
    addFreeRewardToCart,
  } = useOrderStore();

  const { enabledPrinters } = usePrinterSettingsStore((s) => ({
    enabledPrinters: Object.values(s.configs).filter((c) => c.enabled),
  }));

  const {
    phoneInputRef,
    selectableTables,
    isElectronWithPrinters,
    canUseDiscountCode,
    showCashBoxSelector,
    set,
    handleCheckUser,
    handleApplyDiscountCode,
    handleRedeemReward,
    handleApplyWheelVoucher,
  } = useOrderModalState({
    enabledPrinters,
    customerPhone,
    state,
    paymentMethod,
    setState,
    serviceType,
    user,
    token,
    discountType,
    setDiscountType,
    setDiscountCode,
    setAppliedDiscountCode,
    appliedDiscountCode,
    discountAmount,
    editingOrderId,
    cashbackRedeemAmount,
    setCashbackRedeemAmount,
    setCustomerAddress,
    discountCode,
    getTotalAmount,
    addFreeRewardToCart,
    setDiscountAmount,
  });

  const finalAmt = getFinalAmount();
  const paidNow = splitCash + splitCard + splitOnline;

  return (
    <Modal
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="order-modal"
    >
      <ModalShell size="lg" scrollBehavior="inside" dialogClassName="max-w-5xl max-h-[85vh]">
        <ModalHeader className="flex flex-col gap-1 text-right">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
              <LockKeyhole className="h-4 w-4" aria-hidden />
            </span>
            {editingOrderId != null
              ? `ذخیرهٔ تغییرات — فاکتور #${editingOrderId}`
              : 'تکمیل و ثبت سفارش'}
          </h2>
          <p className="text-sm text-muted font-normal">
            {editingOrderId != null
              ? 'پس از تأیید، فاکتور روی سرور به‌روز می‌شود.'
              : 'شماره موبایل را وارد کنید و Enter بزنید برای ثبت سریع'}
          </p>
        </ModalHeader>

        <ModalBody
          className="flex flex-row gap-4 items-start"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
            e.preventDefault();
            if (!isSubmitting && cart.length > 0 && (!isMobileRequired || customerPhone.trim()))
              onSubmit();
          }}
        >
          {/* سبد خرید — ستون سمت راست (RTL). قابل کم/زیادکردن و حذف همین‌جا، بدون بستن مودال.
              sticky تا وقتی فرم سمت چپ اسکرول می‌شود، سبد ثابت در دید بماند */}
          <div className="hidden lg:flex w-[320px] shrink-0 flex-col gap-3 h-[68vh] sticky top-0 self-start">
            <div className="flex-1 min-h-0">
              <OrderCart
                cartItemOptions={cartItemOptions}
                formatPrice={formatPrice}
                onCheckout={() => {}}
                isDisabled={isSubmitting}
                editingOrderId={editingOrderId}
                embedded
              />
            </div>

            {/* Summary — منتقل‌شده به زیر سبد خرید طبق درخواست؛ عمداً همه‌چیز سمت چپ (justify-end) نه دو سر ردیف */}
            <div className="shrink-0 rounded-xl border border-border bg-surface p-4 space-y-2">
              <div className="flex justify-end gap-3 text-sm text-muted">
                <span>جمع کل</span>
                <span className="tabular-nums text-foreground/80">
                  {formatPrice(getTotalAmount())}
                </span>
              </div>
              {discountType === 'code' && appliedDiscountCode ? (
                <div className="flex justify-end gap-3 text-sm text-muted">
                  <span>کد تخفیف ({appliedDiscountCode.code})</span>
                  <span className="tabular-nums">
                    - {formatPrice(appliedDiscountCode.discountAmount)}
                  </span>
                </div>
              ) : getDiscountAmount() > 0 ? (
                <div className="flex justify-end gap-3 text-sm text-muted">
                  <span>تخفیف</span>
                  <span className="tabular-nums">- {formatPrice(getDiscountAmount())}</span>
                </div>
              ) : null}
              {getVatAmount() > 0 && (
                <div className="flex justify-end gap-3 text-sm text-muted">
                  <span>ارزش افزوده</span>
                  <span className="tabular-nums">+ {formatPrice(getVatAmount())}</span>
                </div>
              )}
              {cashbackRedeemAmount > 0 && (
                <div className="flex justify-end gap-3 text-sm text-success-soft-foreground">
                  <span>کش‌بک استفاده‌شده</span>
                  <span className="tabular-nums">- {formatPrice(cashbackRedeemAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 rounded-lg bg-success-soft px-3 py-2.5 mt-1">
                <span className="text-sm font-medium text-success-soft-foreground">
                  قابل پرداخت
                </span>
                <span className="text-lg font-bold tabular-nums text-success-soft-foreground">
                  {discountType === 'code' && !appliedDiscountCode && discountCode.trim()
                    ? '— (کد را ثبت کنید)'
                    : formatPrice(getFinalAmount())}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Phone + customer */}
            <OrderCustomerSection
              phoneInputRef={phoneInputRef}
              isMobileRequired={isMobileRequired}
              customerPhone={customerPhone}
              setCustomerPhone={setCustomerPhone}
              set={set}
              state={state}
              handleCheckUser={handleCheckUser}
              handleApplyWheelVoucher={handleApplyWheelVoucher}
            />

            <OrderServiceSection
              serviceType={serviceType}
              setServiceType={setServiceType}
              setTableNumber={setTableNumber}
              setCustomerAddress={setCustomerAddress}
              setDeliveryLocation={setDeliveryLocation}
              setDeliveryFeeOverride={setDeliveryFeeOverride}
              setDeliveryFeeReason={setDeliveryFeeReason}
              set={set}
              user={user}
              token={token}
              customerPhone={customerPhone}
              finalAmt={finalAmt}
              state={state}
              customerAddress={customerAddress}
              deliveryLocation={deliveryLocation}
              deliveryFeeOverride={deliveryFeeOverride}
              selectableTables={selectableTables}
              tableId={tableId}
              setTable={setTable}
              tableNumber={tableNumber}
            />

            <OrderPaymentSection
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              set={set}
              showCashBoxSelector={showCashBoxSelector}
              state={state}
              splitCash={splitCash}
              setSplitCash={setSplitCash}
              splitCard={splitCard}
              setSplitCard={setSplitCard}
              splitOnline={splitOnline}
              setSplitOnline={setSplitOnline}
              paidNow={paidNow}
              finalAmt={finalAmt}
              formatPrice={formatPrice}
              getSplitCreditAmount={getSplitCreditAmount}
              isCardTerminalEnabled={isCardTerminalEnabled}
              canUseCardTerminal={canUseCardTerminal}
              allowDirectSendAmountToCardTerminal={allowDirectSendAmountToCardTerminal}
              onSendToCardTerminal={onSendToCardTerminal}
              getFinalAmount={getFinalAmount}
              onCancelCardTerminal={onCancelCardTerminal}
              onCardManualConfirm={onCardManualConfirm}
            />

            <OrderDiscountSection
              discountType={discountType}
              canUseDiscountCode={canUseDiscountCode}
              setDiscountType={setDiscountType}
              appliedDiscountCode={appliedDiscountCode}
              state={state}
              discountCode={discountCode}
              setDiscountCode={setDiscountCode}
              set={set}
              setAppliedDiscountCode={setAppliedDiscountCode}
              handleApplyDiscountCode={handleApplyDiscountCode}
              formatPrice={formatPrice}
              discountAmount={discountAmount}
              setDiscountAmount={setDiscountAmount}
              getDiscountAmount={getDiscountAmount}
              cashbackRedeemAmount={cashbackRedeemAmount}
              getFinalAmount={getFinalAmount}
              setCashbackRedeemAmount={setCashbackRedeemAmount}
              handleRedeemReward={handleRedeemReward}
            />

            <Textarea
              label="یادداشت (اختیاری)"
              placeholder="یادداشت برای آشپزخانه"
              value={notes}
              onValueChange={setNotes}
              minRows={2}
              classNames={{ input: 'text-right' }}
            />

            {/* Print options */}
            {isElectronWithPrinters && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">چاپ رسید</span>
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'none', 'select'] as const).map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={state.printOption === opt ? 'solid' : 'bordered'}
                      color="primary"
                      onPress={() => {
                        set({ printOption: opt });
                        if (opt === 'select' && state.selectedPrinterNames.length === 0)
                          set({ selectedPrinterNames: enabledPrinters.map((p) => p.name) });
                      }}
                    >
                      {opt === 'all'
                        ? 'چاپ روی همه'
                        : opt === 'none'
                          ? 'بدون چاپ'
                          : 'انتخاب پرینتر'}
                    </Button>
                  ))}
                </div>
                {state.printOption === 'select' && (
                  <div className="flex flex-col gap-2">
                    {enabledPrinters.map((printer) => (
                      <Checkbox
                        key={printer.name}
                        isSelected={state.selectedPrinterNames.includes(printer.name)}
                        onValueChange={(checked) =>
                          set({
                            selectedPrinterNames: checked
                              ? [...state.selectedPrinterNames, printer.name]
                              : state.selectedPrinterNames.filter((n) => n !== printer.name),
                          })
                        }
                      >
                        {printer.displayName || printer.name}
                      </Checkbox>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter className="gap-2">
          <Button
            variant="flat"
            onPress={onClose}
            isDisabled={
              isSubmitting ||
              state.cardTerminalStatus === 'sending' ||
              state.cardTerminalStatus === 'approved'
            }
          >
            انصراف
          </Button>
          {!(
            paymentMethod === 'card' &&
            isCardTerminalEnabled &&
            canUseCardTerminal &&
            allowDirectSendAmountToCardTerminal &&
            state.cardTerminalStatus !== 'failed'
          ) && (
            <Button
              color="primary"
              onPress={onSubmit}
              isLoading={isSubmitting}
              className="gap-2 font-semibold"
              isDisabled={
                cart.length === 0 ||
                state.cardTerminalStatus === 'sending' ||
                state.cardTerminalStatus === 'approved'
              }
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {isSubmitting
                ? editingOrderId != null
                  ? 'در حال ذخیره...'
                  : 'در حال ثبت...'
                : editingOrderId != null
                  ? 'ذخیرهٔ فاکتور'
                  : 'ثبت نهایی'}
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-mono">
                Enter
              </span>
            </Button>
          )}
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
