import { useRef, useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { Select, SelectItem } from '../../../ui/compat-select';
import { Textarea } from '../../../ui/compat-textarea';
import { ModalShell } from '../../../ui/modal-shell';
import { CheckboxCompat as Checkbox } from '../../../ui/compat-checkbox';
import { useOrderStore } from '../../../store/orderStore';
import { usePrinterSettingsStore } from '../../../store/printerSettingsStore';
import {
  getCustomerAddresses, checkUser, validateDiscountCode, getApplicableDiscountCodes,
  getWheelPrizeVouchers, redeemWheelPrizeVoucher, getTables, getCashbackWallet,
  getPointsRewards, redeemPointsReward,
  type WheelPrizeVoucher, type PosTable, type PointsRewardOption,
} from '../../../services/api';
import { cacheTables, getCachedTables } from '../../../services/cache';
import { isValidIranMobile, normalizeIranMobile, sanitizeMobileInput } from '../../../utils/iranMobile';
import { toast } from '../../../utils/toast';
import { toShamsiDate } from '../../../utils/date';
import { useAuthStore } from '../../../store/authStore';
import { DeliveryDestination } from './DeliveryDestination';

const normalizePriceInput = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};

export interface OrderModalState {
  isOpen: boolean;
  isOnline: boolean;
  userExists: boolean | null;
  isCheckingUser: boolean;
  loadedCustomerFirstName: string;
  loadedCustomerLastName: string;
  customerFirstNameInput: string;
  customerLastNameInput: string;
  showCustomerNameFields: boolean;
  customerAddresses: Array<{ id: number; address: string; label?: string; isDefault: boolean }>;
  selectedAddressId: number | 'new' | null;
  loadingAddresses: boolean;
  printOption: 'all' | 'none' | 'select';
  selectedPrinterNames: string[];
  cardTerminalStatus: 'idle' | 'sending' | 'approved' | 'failed';
  cardTerminalError: string;
  cardTerminalRefId: string;
  cardTerminalProfiles: Array<{ id: string; name: string }>;
  selectedCardTerminalId: string;
  cashBoxAccounts: Array<{ id: number; name: string; accountType: string }>;
  selectedCashBoxId: number | null;
  selectedCashBoxName: string;
  discountCodeError: string;
  availableDiscountCodes: import('../../../services/api').DiscountCodeSummary[];
  loadingAvailableDiscountCodes: boolean;
  wheelVouchers: WheelPrizeVoucher[];
  applyingVoucher: number | null;
  cashbackBalance: number;
  loadingCashback: boolean;
  pointsBalance: number;
  loadingPointsRewards: boolean;
  availableRewards: PointsRewardOption[];
  redeemingTierId: number | null;
  /** محصول انتخاب‌شدهٔ صندوق‌دار برای هر تیر از نوع free_item_category */
  selectedProductByTier: Record<number, number>;
}

interface Props {
  state: OrderModalState;
  setState: React.Dispatch<React.SetStateAction<OrderModalState>>;
  editingOrderId: number | null;
  isMobileRequired: boolean;
  isCardTerminalEnabled: boolean;
  allowDirectSendAmountToCardTerminal: boolean;
  canUseCardTerminal: boolean;
  formatPrice: (price: number) => string;
  onSubmit: () => void;
  onSendToCardTerminal: () => void;
  onCardManualConfirm: () => void;
  onClose: () => void;
}

export function OrderModal({
  state, setState, editingOrderId,
  isMobileRequired, isCardTerminalEnabled, allowDirectSendAmountToCardTerminal, canUseCardTerminal,
  formatPrice, onSubmit, onSendToCardTerminal, onCardManualConfirm, onClose,
}: Props) {
  const { user, token } = useAuthStore();
  const {
    cart, customerPhone, serviceType, tableNumber, tableId, customerAddress, paymentMethod, notes,
    deliveryLocation, deliveryFeeOverride,
    discountType, discountCode, appliedDiscountCode, discountAmount, isSubmitting,
    cashbackRedeemAmount, splitCash, splitCard, splitOnline,
    setCustomerPhone, setServiceType, setTableNumber, setTable, setCustomerAddress,
    setDeliveryLocation, setDeliveryFeeOverride, setDeliveryFeeReason,
    setPaymentMethod, setNotes, setDiscountAmount, setDiscountType,
    setDiscountCode, setAppliedDiscountCode, setCashbackRedeemAmount,
    setSplitCash, setSplitCard, setSplitOnline, getSplitCreditAmount,
    getTotalAmount, getFinalAmount, getDiscountAmount, getVatAmount,
  } = useOrderStore();

  const { enabledPrinters } = usePrinterSettingsStore((s) => ({
    enabledPrinters: Object.values(s.configs).filter((c) => c.enabled),
  }));

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [tables, setTables] = useState<PosTable[]>([]);
  /** میز خارج از سرویس برای ثبت سفارش قابل انتخاب نیست */
  const selectableTables = tables.filter((t) => t.isActive !== false && t.status !== 'out_of_service');
  const isElectronWithPrinters = typeof window !== 'undefined' && Boolean(window.electronAPI) && enabledPrinters.length > 0;
  const canUseDiscountCode = Boolean(customerPhone.trim()) && state.isOnline;

  const set = (patch: Partial<OrderModalState>) => setState((s) => ({ ...s, ...patch }));

  // Focus phone on open
  useEffect(() => {
    if (!state.isOpen) return;
    const t = setTimeout(() => phoneInputRef.current?.focus(), 50);
    const checkOnline = async () => {
      try {
        const online = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;
        set({ isOnline: online });
      } catch { set({ isOnline: navigator.onLine }); }
    };
    checkOnline();
    return () => clearTimeout(t);
  }, [state.isOpen]);

  // Reset card terminal when modal closes
  useEffect(() => {
    if (!state.isOpen) set({ cardTerminalStatus: 'idle', cardTerminalError: '', cardTerminalRefId: '' });
  }, [state.isOpen]);

  /**
   * میزهای رستوران. آنلاین از سرور خوانده و کش می‌شود؛ آفلاین از همان کش
   * می‌آید. اگر رستوران میزی تعریف نکرده باشد، ورودی متنی شماره میز
   * (رفتار قبلی) نمایش داده می‌شود.
   */
  useEffect(() => {
    if (!state.isOpen || serviceType !== 'dine_in') return;
    const restaurantId = user?.restaurants?.[0]?.id;
    if (!restaurantId) return;

    let cancelled = false;
    getCachedTables(restaurantId).then((cached) => {
      if (!cancelled && cached.length) setTables(cached as PosTable[]);
    });

    if (!token) return;
    const onlineCheck = window.electronAPI ? window.electronAPI.checkOnline() : Promise.resolve(navigator.onLine);
    onlineCheck.then((online) => {
      if (!online || cancelled) return;
      getTables(restaurantId, token)
        .then((list) => {
          if (cancelled) return;
          setTables(list);
          void cacheTables(restaurantId, list);
        })
        .catch(() => {
          // آفلاین/خطا — همان کش قبلی نمایش داده می‌شود
        });
    });
    return () => { cancelled = true; };
  }, [state.isOpen, serviceType, token, user?.restaurants]);

  // Discount type guard
  useEffect(() => {
    if (discountType === 'code' && !canUseDiscountCode) {
      setDiscountType('fixed');
      setDiscountCode('');
      setAppliedDiscountCode(null);
      set({ discountCodeError: '' });
    }
  }, [discountType, canUseDiscountCode]);

  // Load available discount codes
  useEffect(() => {
    if (!state.isOpen || !canUseDiscountCode) { set({ availableDiscountCodes: [] }); return; }
    const restaurantName = user?.restaurants?.[0]?.name;
    if (!restaurantName) return;
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!isValidIranMobile(normalized)) { set({ availableDiscountCodes: [] }); return; }
    let cancelled = false;
    set({ loadingAvailableDiscountCodes: true });
    getApplicableDiscountCodes({ restaurantName, phone: normalized }, token || undefined)
      .then((codes) => {
        if (cancelled) return;
        set({ availableDiscountCodes: codes });
        if (codes.length > 0 && discountType !== 'code' && !appliedDiscountCode && discountAmount === 0 && editingOrderId == null) {
          setDiscountType('code');
        }
      })
      .catch(() => { if (!cancelled) set({ availableDiscountCodes: [] }); })
      .finally(() => { if (!cancelled) set({ loadingAvailableDiscountCodes: false }); });
    return () => { cancelled = true; };
  }, [state.isOpen, canUseDiscountCode, customerPhone, token]);

  // موجودی کیف پول کش‌بک — مختص همین رستوران، هرگز رستوران دیگر درز نمی‌کند
  useEffect(() => {
    if (!state.isOpen || !state.isOnline) { set({ cashbackBalance: 0 }); return; }
    const restaurantId = user?.restaurants?.[0]?.id;
    if (!restaurantId) return;
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!isValidIranMobile(normalized)) {
      set({ cashbackBalance: 0 });
      if (cashbackRedeemAmount > 0) setCashbackRedeemAmount(0);
      return;
    }
    let cancelled = false;
    set({ loadingCashback: true });
    getCashbackWallet({ restaurantId, phone: normalized }, token || undefined)
      .then(({ balance }) => {
        if (cancelled) return;
        set({ cashbackBalance: balance });
      })
      .catch(() => { if (!cancelled) set({ cashbackBalance: 0 }); })
      .finally(() => { if (!cancelled) set({ loadingCashback: false }); });
    return () => { cancelled = true; };
  }, [state.isOpen, state.isOnline, customerPhone, token, user?.restaurants]);

  // موجودی امتیاز و کاتالوگ جوایز قابل‌دریافت — مختص همین رستوران
  const loadPointsRewards = () => {
    const restaurantId = user?.restaurants?.[0]?.id;
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!state.isOpen || !state.isOnline || !restaurantId || !isValidIranMobile(normalized)) {
      set({ pointsBalance: 0, availableRewards: [] });
      return;
    }
    set({ loadingPointsRewards: true });
    getPointsRewards({ restaurantId, phone: normalized }, token || undefined)
      .then(({ balance, tiers }) => set({ pointsBalance: balance, availableRewards: tiers }))
      .catch(() => set({ pointsBalance: 0, availableRewards: [] }))
      .finally(() => set({ loadingPointsRewards: false }));
  };

  useEffect(() => {
    loadPointsRewards();
  }, [state.isOpen, state.isOnline, customerPhone, token, user?.restaurants]);

  // آدرس‌های قبلی مشتری — هم بیرون‌بر و هم ارسال با پیک.
  // فروشگاهی که پیک ندارد و خودش می‌برد از «بیرون‌بر» استفاده می‌کند و
  // به همان اندازه به آدرس آماده نیاز دارد.
  useEffect(() => {
    const needsAddress = serviceType === 'takeaway' || serviceType === 'delivery';
    if (!state.isOpen || !needsAddress || !token || !customerPhone.trim()) {
      set({ customerAddresses: [], selectedAddressId: null });
      return;
    }
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!isValidIranMobile(normalized)) { set({ customerAddresses: [], selectedAddressId: null }); return; }
    const restaurantId = user?.restaurants?.[0]?.id;
    const restaurantName = user?.restaurants?.[0]?.name;
    if (!restaurantId && !restaurantName) return;
    let cancelled = false;
    set({ loadingAddresses: true });
    const onlineCheck = window.electronAPI ? window.electronAPI.checkOnline() : Promise.resolve(navigator.onLine);
    onlineCheck.then((online) => {
      if (!online || cancelled) { set({ loadingAddresses: false }); return; }
      getCustomerAddresses({ restaurantId, restaurantName, phone: normalized }, token)
        .then((list) => {
          if (cancelled) return;
          set({ customerAddresses: list });
          const defaultOne = list.find((a) => a.isDefault) || list[0];
          if (defaultOne) {
            set({ selectedAddressId: defaultOne.id });
            setCustomerAddress(defaultOne.address);
          } else {
            set({ selectedAddressId: list.length > 0 ? list[0].id : 'new' });
            if (list.length > 0) setCustomerAddress(list[0].address);
          }
        })
        .catch(() => { if (!cancelled) set({ customerAddresses: [], selectedAddressId: 'new' }); })
        .finally(() => { if (!cancelled) set({ loadingAddresses: false }); });
    });
    return () => { cancelled = true; };
  }, [state.isOpen, serviceType, customerPhone, token]);

  const handleCheckUser = async () => {
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!isValidIranMobile(normalized)) { toast.error('فرمت شماره موبایل معتبر نیست'); return; }
    set({ isCheckingUser: true, wheelVouchers: [] });
    try {
      const isOnline = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;
      if (isOnline) {
        const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
        const [response, vouchers] = await Promise.all([
          checkUser(normalized),
          restaurantId ? getWheelPrizeVouchers({ restaurantId, phone: normalized }, token ?? undefined) : Promise.resolve([]),
        ]);
        set({
          userExists: response.userExists || false,
          loadedCustomerFirstName: response.userExists ? (response.firstName ?? '') : '',
          loadedCustomerLastName: response.userExists ? (response.lastName ?? '') : '',
          customerFirstNameInput: response.userExists ? (response.firstName ?? '') : '',
          customerLastNameInput: response.userExists ? (response.lastName ?? '') : '',
          wheelVouchers: vouchers,
        });
      } else {
        set({ userExists: null });
      }
    } catch {
      set({ userExists: null, loadedCustomerFirstName: '', loadedCustomerLastName: '' });
    } finally {
      set({ isCheckingUser: false });
    }
  };

  const handleApplyDiscountCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? discountCode).trim();
    if (!code || !token || !user?.restaurants?.[0]?.name) return;
    set({ discountCodeError: '' });
    const result = await validateDiscountCode(
      { code, restaurantName: user.restaurants[0].name, totalAmount: getTotalAmount(), userPhone: customerPhone.trim() || undefined },
      token,
    ).catch((err: any) => {
      set({ discountCodeError: err?.response?.data?.message || err?.message || 'خطا در اعتبارسنجی' });
      return null;
    });
    if (result?.valid && typeof result.discountAmount === 'number') {
      setAppliedDiscountCode({ code, discountAmount: result.discountAmount });
    } else if (result) {
      set({ discountCodeError: result.message || 'کد تخفیف معتبر نیست' });
      setAppliedDiscountCode(null);
    }
  };

  const handleRedeemReward = async (tier: PointsRewardOption) => {
    const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!restaurantId || !isValidIranMobile(normalized)) return;
    const productId =
      tier.rewardType === 'free_item_category' ? state.selectedProductByTier[tier.id] : undefined;
    if (tier.rewardType === 'free_item_category' && !productId) {
      toast.error('ابتدا محصول موردنظر را از این دسته انتخاب کنید');
      return;
    }
    set({ redeemingTierId: tier.id });
    try {
      const result = await redeemPointsReward(
        { restaurantId, phone: normalized, tierId: tier.id, productId },
        token ?? undefined,
      );
      setDiscountType('code');
      setDiscountCode(result.discountCode);
      await handleApplyDiscountCode(result.discountCode);
      toast.success(result.message || `کد تخفیف ${result.discountCode} اعمال شد`);
      loadPointsRewards();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'خطا در دریافت جایزه');
    } finally {
      set({ redeemingTierId: null });
    }
  };

  const handleApplyWheelVoucher = async (voucher: WheelPrizeVoucher) => {
    const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
    if (!restaurantId) return;
    set({ applyingVoucher: voucher.id });
    try {
      await redeemWheelPrizeVoucher({ restaurantId, voucherId: voucher.id }, token ?? undefined);
      if (voucher.prizeType === 'discount_percent') {
        const disc = Math.round((getTotalAmount() * Number(voucher.prizeData?.percent || 0)) / 100);
        setDiscountType('fixed'); setDiscountAmount(disc); setAppliedDiscountCode(null);
        toast.success(`🎡 تخفیف ${voucher.prizeData?.percent}٪ اعمال شد`);
      } else if (voucher.prizeType === 'discount_amount') {
        const disc = Number(voucher.prizeData?.amount || 0);
        setDiscountType('fixed'); setDiscountAmount(disc); setAppliedDiscountCode(null);
        toast.success(`🎡 تخفیف اعمال شد`);
      } else {
        toast.success(`🎡 جایزه گردونه اعمال شد`);
      }
      set({ wheelVouchers: state.wheelVouchers.filter((v) => v.id !== voucher.id) });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'خطا در اعمال ووچر');
    } finally {
      set({ applyingVoucher: null });
    }
  };

  const finalAmt = getFinalAmount();
  const paidNow = splitCash + splitCard + splitOnline;

  return (
    <Modal isOpen={state.isOpen} onOpenChange={(open) => { if (!open) onClose(); }} className="order-modal">
      <ModalShell size="lg" scrollBehavior="inside">
        <ModalHeader className="flex flex-col gap-1 text-right">
          <h2 className="text-lg font-semibold">
            {editingOrderId != null ? `ذخیرهٔ تغییرات — فاکتور #${editingOrderId}` : 'تکمیل و ثبت سفارش'}
          </h2>
          <p className="text-sm text-default-500 font-normal">
            {editingOrderId != null ? 'پس از تأیید، فاکتور روی سرور به‌روز می‌شود.' : 'شماره موبایل را وارد کنید و Enter بزنید برای ثبت سریع'}
          </p>
        </ModalHeader>

        <ModalBody className="gap-4" onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
          e.preventDefault();
          if (!isSubmitting && cart.length > 0 && (!isMobileRequired || customerPhone.trim())) onSubmit();
        }}>
          {/* Phone + customer */}
          <div className="flex flex-col gap-2">
            <Input
              ref={phoneInputRef}
              label={`شماره تماس ${isMobileRequired ? '(اجباری)' : ''}`}
              placeholder="09123456789"
              value={customerPhone}
              onValueChange={(v) => {
                setCustomerPhone(sanitizeMobileInput(v));
                set({ userExists: null, loadedCustomerFirstName: '', loadedCustomerLastName: '', customerFirstNameInput: '', customerLastNameInput: '', showCustomerNameFields: false, wheelVouchers: [] });
              }}
              autoComplete="tel" inputMode="numeric" variant="bordered"
              isInvalid={customerPhone.length > 0 && !isValidIranMobile(customerPhone)}
              errorMessage={customerPhone.length > 0 && !isValidIranMobile(customerPhone) ? 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود' : undefined}
              endContent={
                <Button size="sm" isDisabled={state.isCheckingUser || !customerPhone.trim()} onPress={handleCheckUser}>
                  {state.isCheckingUser ? '...' : '✓'}
                </Button>
              }
              classNames={{ input: 'text-right' }}
            />

            {state.userExists === true && (
              <span className="text-success text-sm">
                {[state.loadedCustomerFirstName, state.loadedCustomerLastName].filter(Boolean).join(' ').trim() || 'مشتری ثبت‌نام شده'}
              </span>
            )}

            {(state.userExists === true || state.showCustomerNameFields) && (
              <div className="flex flex-col gap-2 p-3 rounded-lg bg-default-50 border border-default-200">
                <span className="text-default-700 text-sm font-medium">نام مشتری (اختیاری)</span>
                <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                  <Input placeholder="نام" value={state.customerFirstNameInput}
                    onValueChange={(v) => set({ customerFirstNameInput: v })}
                    size="sm" variant="bordered" classNames={{ input: 'text-right' }} />
                  <Input placeholder="نام خانوادگی" value={state.customerLastNameInput}
                    onValueChange={(v) => set({ customerLastNameInput: v })}
                    size="sm" variant="bordered" classNames={{ input: 'text-right' }} />
                </div>
              </div>
            )}

            {state.userExists === false && (
              <div className="flex flex-col gap-3 p-3 rounded-lg bg-warning-50 border border-warning-200">
                <span className="text-warning-700 text-sm font-medium">مشتری جدید</span>
                <Button size="sm" color="primary" isDisabled={state.showCustomerNameFields}
                  onPress={() => set({ showCustomerNameFields: true })}>
                  {state.showCustomerNameFields ? 'نام مشتری را وارد کنید' : 'افزودن به مشتریان'}
                </Button>
              </div>
            )}

            {/* Wheel vouchers */}
            {state.wheelVouchers.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3" dir="rtl">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: 18 }}>🎡</span>
                  <span className="text-sm font-bold text-amber-800">جوایز گردونه شانس ({state.wheelVouchers.length})</span>
                </div>
                {state.wheelVouchers.map((v) => {
                  const prizeLabel = v.prizeType === 'discount_percent' ? `${v.prizeData?.percent ?? 0}٪ تخفیف`
                    : v.prizeType === 'discount_amount' ? `${Number(v.prizeData?.amount ?? 0).toLocaleString('fa-IR')} ریال تخفیف`
                    : v.prizeType === 'free_product' ? `کالای رایگان: ${v.prizeData?.productName ?? ''}`
                    : `${v.prizeData?.points ?? 0} امتیاز`;
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-amber-900">{prizeLabel}</span>
                        {v.expiresAt && <span className="text-xs text-amber-600">انقضا: {toShamsiDate(v.expiresAt)}</span>}
                      </div>
                      <Button size="sm" color="warning" isLoading={state.applyingVoucher === v.id}
                        onPress={() => handleApplyWheelVoucher(v)}
                        className="shrink-0 font-bold text-white bg-amber-500 hover:bg-amber-600">
                        اعمال
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Service type */}
          <Select label="نوع سفارش" selectedKeys={[serviceType]}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0] as 'dine_in' | 'takeaway' | 'delivery';
              if (v) {
                setServiceType(v);
                setTableNumber('');
                setCustomerAddress('');
                setDeliveryLocation(null);
                setDeliveryFeeOverride(null);
                setDeliveryFeeReason('');
                set({ customerAddresses: [], selectedAddressId: null });
              }
            }} variant="bordered">
            <SelectItem key="dine_in" textValue="داخل سالن">داخل سالن</SelectItem>
            <SelectItem key="takeaway" textValue="بیرون‌بر">بیرون‌بر</SelectItem>
            <SelectItem key="delivery" textValue="ارسال با پیک">ارسال با پیک</SelectItem>
          </Select>

          {serviceType === 'delivery' && (
            <DeliveryDestination
              restaurantId={user?.restaurants?.[0]?.id}
              token={token}
              customerPhone={customerPhone}
              cartSubtotal={finalAmt}
              savedAddresses={state.customerAddresses}
              address={customerAddress}
              onAddressChange={setCustomerAddress}
              location={deliveryLocation}
              onLocationChange={setDeliveryLocation}
              feeOverride={deliveryFeeOverride}
              onFeeOverrideChange={(fee, reason) => {
                setDeliveryFeeOverride(fee);
                setDeliveryFeeReason(reason);
              }}
            />
          )}

          {serviceType === 'dine_in' ? (
            selectableTables.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">میز</span>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {selectableTables.map((table) => {
                    const selected = tableId === table.id;
                    const occupied = table.status === 'occupied';
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => setTable(selected ? null : { id: table.id, name: table.name })}
                        aria-pressed={selected}
                        className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 font-semibold'
                            : occupied
                              ? 'border-danger/40 bg-danger/5'
                              : 'border-default-200 hover:border-default-300'
                        }`}
                      >
                        <span className="block truncate">{table.name}</span>
                        <span className="block text-[10px] text-default-500">
                          {occupied ? 'اشغال' : table.status === 'reserved' ? 'رزرو' : `${table.capacity} نفره`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-default-500">
                  انتخاب میز اختیاری است؛ میز اشغال هم برای سفارش تکمیلی قابل انتخاب است.
                </span>
              </div>
            ) : (
              <Input label="شماره میز (اختیاری)" placeholder="A12" value={tableNumber}
                onValueChange={setTableNumber} variant="bordered" classNames={{ input: 'text-right' }} />
            )
          ) : serviceType === 'takeaway' ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">آدرس</span>
              {state.loadingAddresses && <p className="text-default-500 text-sm">در حال بارگذاری آدرس‌ها...</p>}
              {!state.loadingAddresses && state.customerAddresses.length > 0 && (
                <div className="flex flex-col gap-2">
                  {state.customerAddresses.map((addr) => (
                    <Checkbox key={addr.id} isSelected={state.selectedAddressId === addr.id}
                      onValueChange={() => { set({ selectedAddressId: addr.id }); setCustomerAddress(addr.address); }}>
                      <span className="text-sm">{addr.label ? `${addr.label}: ` : ''}{addr.address}</span>
                    </Checkbox>
                  ))}
                  <Checkbox isSelected={state.selectedAddressId === 'new'}
                    onValueChange={() => { set({ selectedAddressId: 'new' }); setCustomerAddress(''); }}>
                    آدرس جدید
                  </Checkbox>
                </div>
              )}
              {(state.selectedAddressId === 'new' || state.customerAddresses.length === 0) && (
                <Textarea placeholder="آدرس تحویل" value={customerAddress}
                  onValueChange={(v) => { setCustomerAddress(v); if (state.customerAddresses.length > 0) set({ selectedAddressId: 'new' }); }}
                  minRows={2} variant="bordered" classNames={{ input: 'text-right' }} />
              )}
            </div>
          ) : null}

          {/* Payment method */}
          <Select label="روش پرداخت" selectedKeys={[paymentMethod]}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0];
              if (v) {
                setPaymentMethod(v as any);
                if (v !== 'card') set({ cardTerminalStatus: 'idle', cardTerminalError: '', cardTerminalRefId: '' });
              }
            }} variant="bordered">
            <SelectItem key="cash" textValue="نقد">نقد</SelectItem>
            <SelectItem key="card" textValue="کارت">کارت</SelectItem>
            <SelectItem key="online" textValue="آنلاین">آنلاین</SelectItem>
            <SelectItem key="mixed" textValue="ترکیبی">ترکیبی</SelectItem>
            <SelectItem key="credit" textValue="اعتباری (نسیه)">اعتباری (نسیه)</SelectItem>
          </Select>

          {/* Cash box selector */}
          {state.cashBoxAccounts.length > 1 && (paymentMethod === 'cash' || paymentMethod === 'mixed' || paymentMethod === 'credit') && (
            <Select label="صندوق" selectedKeys={state.selectedCashBoxId ? [String(state.selectedCashBoxId)] : []}
              onSelectionChange={(keys) => {
                const id = Number(Array.from(keys)[0]);
                const acc = state.cashBoxAccounts.find((a) => a.id === id);
                if (acc) set({ selectedCashBoxId: acc.id, selectedCashBoxName: acc.name || 'صندوق' });
              }} variant="bordered" size="sm">
              {state.cashBoxAccounts.map((acc) => <SelectItem key={String(acc.id)}>{acc.name}</SelectItem>)}
            </Select>
          )}

          {/* Mixed payment */}
          {(paymentMethod === 'mixed' || paymentMethod === 'credit') && (
            <div className={`rounded-lg border p-3 flex flex-col gap-3 ${paymentMethod === 'credit' ? 'border-warning-200 bg-warning-50' : 'border-default-200 bg-default-50'}`}>
              <p className="text-sm font-semibold text-foreground">تقسیم پرداخت{paymentMethod === 'credit' ? ' — نسیه' : ''}</p>
              <div className="grid grid-cols-3 gap-2">
                {[['نقد', splitCash, setSplitCash], ['کارت', splitCard, setSplitCard], ['آنلاین', splitOnline, setSplitOnline]].map(([label, val, setter]) => (
                  <Input key={label as string} label={`${label} (ریال)`}
                    value={(val as number) > 0 ? formatPriceInput(String(val)) : ''}
                    onChange={(e) => (setter as Function)(Number(normalizePriceInput(e.target.value)) || 0)}
                    placeholder="0" type="text" inputMode="numeric" size="sm" variant="bordered"
                    classNames={{ input: 'text-center' }} />
                ))}
              </div>
              <div className={`rounded-lg p-2.5 text-sm flex flex-col gap-1 ${paidNow > finalAmt ? 'bg-danger-100 border border-danger-300' : 'bg-white border border-default-200'}`}>
                {paidNow > 0 && (
                  <div className="flex justify-between text-default-600">
                    <span>پرداخت‌شده</span>
                    <span className="text-success-700 font-semibold">{formatPrice(paidNow)}</span>
                  </div>
                )}
                {paymentMethod === 'credit' ? (
                  <div className="flex justify-between font-semibold">
                    <span className={getSplitCreditAmount() > 0 ? 'text-danger' : 'text-success-700'}>
                      {getSplitCreditAmount() > 0 ? 'اعتباری (نسیه)' : 'کل پرداخت شد ✓'}
                    </span>
                    <span className={getSplitCreditAmount() > 0 ? 'text-danger' : 'text-success-700'}>{formatPrice(getSplitCreditAmount())}</span>
                  </div>
                ) : (
                  <div className={`flex justify-between font-semibold ${paidNow > finalAmt ? 'text-danger' : Math.max(0, finalAmt - paidNow) > 0 ? 'text-warning-700' : 'text-success-700'}`}>
                    <span>{paidNow > finalAmt ? '⚠ بیشتر از مبلغ' : Math.max(0, finalAmt - paidNow) > 0 ? 'نسیه (اعتباری)' : '✓ کامل پرداخت شد'}</span>
                    <span>{formatPrice(paidNow > finalAmt ? paidNow - finalAmt : Math.max(0, finalAmt - paidNow))}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Card terminal */}
          {paymentMethod === 'card' && isCardTerminalEnabled && canUseCardTerminal && allowDirectSendAmountToCardTerminal && (
            <div className="rounded-xl border border-default-200 bg-default-50 p-3 flex flex-col gap-3 text-sm">
              <p className="font-medium text-foreground">پرداخت کارتخوان</p>
              {state.cardTerminalProfiles.length > 1 && state.cardTerminalStatus === 'idle' && (
                <Select size="sm" label="انتخاب کارتخوان"
                  selectedKeys={state.selectedCardTerminalId ? [state.selectedCardTerminalId] : []}
                  onSelectionChange={(keys) => set({ selectedCardTerminalId: String(Array.from(keys)[0] || '') })}
                  variant="bordered">
                  {state.cardTerminalProfiles.map((t) => <SelectItem key={t.id}>{t.name}</SelectItem>)}
                </Select>
              )}
              {state.cardTerminalStatus === 'idle' && (
                <Button color="primary" size="sm" onPress={onSendToCardTerminal}>
                  ارسال {formatPrice(getFinalAmount())} به کارتخوان
                </Button>
              )}
              {state.cardTerminalStatus === 'sending' && (
                <div className="flex items-center gap-2 text-primary-700 py-1">
                  <span className="animate-spin text-base">⏳</span>
                  <span>در حال ارتباط با کارتخوان — لطفاً کارت بکشید...</span>
                </div>
              )}
              {state.cardTerminalStatus === 'approved' && (
                <div className="flex items-center gap-2 text-success-700 py-1">
                  <span className="text-base">✅</span>
                  <span>کارتخوان تأیید کرد، در حال ثبت سفارش...{state.cardTerminalRefId && <span className="text-xs text-default-500 mr-2">(Ref: {state.cardTerminalRefId})</span>}</span>
                </div>
              )}
              {state.cardTerminalStatus === 'failed' && (
                <div className="flex flex-col gap-2">
                  <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-danger-700 text-xs">
                    ⚠ {state.cardTerminalError || 'کارتخوان جواب نداد یا خطا رخ داد.'}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="flat" onPress={() => set({ cardTerminalStatus: 'idle', cardTerminalError: '' })}>تلاش مجدد</Button>
                    <Button size="sm" color="warning" onPress={onCardManualConfirm}>ثبت دستی — کارت کشیده شد</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Discount */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">تخفیف</span>
            <div className="flex gap-2 flex-wrap">
              {(['percentage', 'fixed', 'code'] as const).map((type) => (
                <Button key={type} size="sm"
                  variant={discountType === type ? 'solid' : 'bordered'} color="primary"
                  isDisabled={type === 'code' && !canUseDiscountCode}
                  onPress={() => type !== 'code' || canUseDiscountCode ? setDiscountType(type) : undefined}>
                  {type === 'percentage' ? 'درصدی' : type === 'fixed' ? 'ریالی' : 'کد تخفیف'}
                </Button>
              ))}
            </div>
            {discountType === 'code' ? (
              <div className="flex flex-col gap-2">
                {!appliedDiscountCode && state.availableDiscountCodes.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-default-500 font-medium">کدهای تخفیف این مشتری</span>
                    <div className="flex flex-wrap gap-1.5">
                      {state.availableDiscountCodes.map((dc) => (
                        <button key={dc.id} type="button"
                          className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-right transition cursor-pointer ${discountCode.toUpperCase() === dc.code.toUpperCase() ? 'border-primary bg-primary/10 text-primary' : 'border-default-200 bg-default-50 hover:border-primary text-foreground'}`}
                          onClick={async () => { setDiscountCode(dc.code); set({ discountCodeError: '' }); setAppliedDiscountCode(null); await handleApplyDiscountCode(dc.code); }}>
                          <span className="font-mono font-bold text-xs tracking-wider">{dc.code}</span>
                          <span className="text-xs mt-0.5 text-default-500">
                            {dc.type === 'percentage' ? `${dc.value}٪` : formatPrice(dc.value)} تخفیف
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap items-end">
                  <Input type="text" placeholder="کد تخفیف" value={discountCode}
                    onValueChange={(v) => { setDiscountCode(v); set({ discountCodeError: '' }); }}
                    isDisabled={!!appliedDiscountCode} variant="bordered" classNames={{ input: 'text-right uppercase' }} />
                  {!appliedDiscountCode ? (
                    <Button size="sm" color="primary" onPress={() => handleApplyDiscountCode()} isDisabled={!discountCode.trim()}>ثبت</Button>
                  ) : (
                    <>
                      <span className="text-success text-sm">تخفیف: {formatPrice(appliedDiscountCode.discountAmount)}</span>
                      <Button size="sm" variant="flat" color="danger" onPress={() => { setAppliedDiscountCode(null); setDiscountCode(''); set({ discountCodeError: '' }); }}>لغو</Button>
                    </>
                  )}
                </div>
                {state.discountCodeError && <small className="text-danger text-xs">{state.discountCodeError}</small>}
              </div>
            ) : (
              <>
                <Input
                  type={discountType === 'fixed' ? 'text' : 'number'}
                  inputMode={discountType === 'fixed' ? 'numeric' : undefined}
                  min={0} max={discountType === 'percentage' ? 100 : undefined}
                  placeholder={discountType === 'percentage' ? 'مثال: 10' : 'مثال: 50,000'}
                  value={discountType === 'fixed' ? (discountAmount ? formatPriceInput(String(discountAmount)) : '') : (discountAmount ? String(discountAmount) : '')}
                  onValueChange={(v) => setDiscountAmount(discountType === 'fixed' ? (Number(normalizePriceInput(v)) || 0) : (Number(v) || 0))}
                  endContent={discountType === 'fixed' ? <span className="text-default-400 text-sm whitespace-nowrap">ریال</span> : undefined}
                  variant="bordered" classNames={{ input: 'text-right' }} />
                {getDiscountAmount() > 0 && <small className="text-default-500">مبلغ تخفیف: {formatPrice(getDiscountAmount())}</small>}
              </>
            )}
          </div>

          {/* کیف پول کش‌بک — مختص همین رستوران، فقط با شماره مشتری معتبر نمایش داده می‌شود */}
          {state.cashbackBalance > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-teal-800">موجودی کیف پول کش‌بک مشتری</span>
                <span className="text-sm font-bold text-teal-800">{formatPrice(state.cashbackBalance)}</span>
              </div>
              <div className="flex gap-2 flex-wrap items-end">
                <Input type="text" inputMode="numeric" placeholder="چقدر استفاده شود؟"
                  value={cashbackRedeemAmount ? formatPriceInput(String(cashbackRedeemAmount)) : ''}
                  onValueChange={(v) => {
                    const requested = Number(normalizePriceInput(v)) || 0;
                    const cap = Math.min(state.cashbackBalance, getFinalAmount() + cashbackRedeemAmount);
                    setCashbackRedeemAmount(Math.min(requested, cap));
                  }}
                  endContent={<span className="text-default-400 text-sm whitespace-nowrap">ریال</span>}
                  variant="bordered" classNames={{ input: 'text-right' }} />
                <Button size="sm" variant="flat" color="primary"
                  onPress={() => setCashbackRedeemAmount(Math.min(state.cashbackBalance, getFinalAmount() + cashbackRedeemAmount))}>
                  استفاده همه
                </Button>
                {cashbackRedeemAmount > 0 && (
                  <Button size="sm" variant="flat" color="danger" onPress={() => setCashbackRedeemAmount(0)}>انصراف</Button>
                )}
              </div>
            </div>
          )}

          {/* کاتالوگ جوایز امتیازی — مشتری با موجودی امتیازش می‌تواند اینجا یک جایزه بگیرد؛
              با گرفتن جایزه، یک کد تخفیف یک‌بارمصرف ساخته و بلافاصله روی همین سفارش اعمال می‌شود */}
          {state.pointsBalance > 0 && state.availableRewards.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-amber-800">موجودی امتیاز مشتری</span>
                <span className="text-sm font-bold text-amber-800">{state.pointsBalance.toLocaleString('fa-IR')} امتیاز</span>
              </div>
              <div className="flex flex-col gap-2">
                {state.availableRewards.map((tier) => (
                  <div key={tier.id} className="flex flex-col gap-2 rounded-md bg-white/70 border border-amber-100 p-2">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{tier.title}</span>
                        <span className="text-xs text-default-500">
                          {tier.pointsCost.toLocaleString('fa-IR')} امتیاز
                          {tier.rewardType === 'free_specific_item' && tier.product ? ` — ${tier.product.name}` : ''}
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
                          state.selectedProductByTier[tier.id] ? [String(state.selectedProductByTier[tier.id])] : []
                        }
                        onSelectionChange={(keys) => {
                          const selected = Number(Array.from(keys as Set<string>)[0]);
                          set({ selectedProductByTier: { ...state.selectedProductByTier, [tier.id]: selected } });
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

          <Textarea label="یادداشت (اختیاری)" placeholder="یادداشت برای آشپزخانه" value={notes}
            onValueChange={setNotes} minRows={2} classNames={{ input: 'text-right' }} />

          {/* Summary */}
          <div className="rounded-lg bg-default-100 p-4 space-y-2">
            <div className="flex justify-between text-foreground">
              <span>جمع کل:</span><span>{formatPrice(getTotalAmount())}</span>
            </div>
            {discountType === 'code' && appliedDiscountCode ? (
              <div className="flex justify-between text-foreground">
                <span>کد تخفیف ({appliedDiscountCode.code}):</span><span>- {formatPrice(appliedDiscountCode.discountAmount)}</span>
              </div>
            ) : getDiscountAmount() > 0 ? (
              <div className="flex justify-between text-foreground">
                <span>تخفیف:</span><span>- {formatPrice(getDiscountAmount())}</span>
              </div>
            ) : null}
            {getVatAmount() > 0 && (
              <div className="flex justify-between text-foreground">
                <span>ارزش افزوده:</span><span>+ {formatPrice(getVatAmount())}</span>
              </div>
            )}
            {cashbackRedeemAmount > 0 && (
              <div className="flex justify-between text-teal-700">
                <span>کش‌بک استفاده‌شده:</span><span>- {formatPrice(cashbackRedeemAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground pt-2 border-t border-default-200">
              <span>مبلغ نهایی:</span>
              <span>{discountType === 'code' && !appliedDiscountCode && discountCode.trim() ? '— (کد را ثبت کنید)' : formatPrice(getFinalAmount())}</span>
            </div>
          </div>

          {/* Print options */}
          {isElectronWithPrinters && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">چاپ رسید</span>
              <div className="flex gap-2 flex-wrap">
                {(['all', 'none', 'select'] as const).map((opt) => (
                  <Button key={opt} size="sm" variant={state.printOption === opt ? 'solid' : 'bordered'} color="primary"
                    onPress={() => {
                      set({ printOption: opt });
                      if (opt === 'select' && state.selectedPrinterNames.length === 0)
                        set({ selectedPrinterNames: enabledPrinters.map((p) => p.name) });
                    }}>
                    {opt === 'all' ? 'چاپ روی همه' : opt === 'none' ? 'بدون چاپ' : 'انتخاب پرینتر'}
                  </Button>
                ))}
              </div>
              {state.printOption === 'select' && (
                <div className="flex flex-col gap-2">
                  {enabledPrinters.map((printer) => (
                    <Checkbox key={printer.name}
                      isSelected={state.selectedPrinterNames.includes(printer.name)}
                      onValueChange={(checked) => set({
                        selectedPrinterNames: checked
                          ? [...state.selectedPrinterNames, printer.name]
                          : state.selectedPrinterNames.filter((n) => n !== printer.name),
                      })}>
                      {printer.displayName || printer.name}
                    </Checkbox>
                  ))}
                </div>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="gap-2">
          <Button variant="flat" onPress={onClose}
            isDisabled={isSubmitting || state.cardTerminalStatus === 'sending' || state.cardTerminalStatus === 'approved'}>
            انصراف
          </Button>
          {!(paymentMethod === 'card' && isCardTerminalEnabled && canUseCardTerminal && allowDirectSendAmountToCardTerminal && state.cardTerminalStatus !== 'failed') && (
            <Button color="primary" onPress={onSubmit} isLoading={isSubmitting}
              isDisabled={cart.length === 0 || state.cardTerminalStatus === 'sending' || state.cardTerminalStatus === 'approved'}>
              {isSubmitting
                ? (editingOrderId != null ? 'در حال ذخیره...' : 'در حال ثبت...')
                : (editingOrderId != null ? 'ذخیرهٔ فاکتور' : 'ثبت نهایی')}
            </Button>
          )}
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
