import type { PrinterConfig } from '../../../../store/printerSettingsStore';
import type { User } from '../../../../store/authStore';
import type { DiscountType } from '../../../../types';
import type { AppliedDiscountCode } from '../../../../store/orderStore';
import type { Dispatch, SetStateAction } from 'react';
import { useRef, useState, useEffect } from 'react';
import {
  type PosTable,
  getTables,
  getApplicableDiscountCodes,
  getCashbackWallet,
  getReferralSettings,
  getPointsRewards,
  getCustomerAddresses,
  checkUser,
  getWheelPrizeVouchers,
  validateDiscountCode,
  type PointsRewardOption,
  redeemPointsReward,
  type WheelPrizeVoucher,
  redeemWheelPrizeVoucher,
} from '../../../../services/api';
import { getCachedTables, cacheTables } from '../../../../services/cache';
import { normalizeIranMobile, isValidIranMobile } from '../../../../utils/iranMobile';
import { toast } from '../../../../utils/toast';
import { type OrderModalState } from './shared';

export interface useOrderModalStateArgs {
  enabledPrinters: PrinterConfig[];
  customerPhone: string;
  state: OrderModalState;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  setState: Dispatch<SetStateAction<OrderModalState>>;
  serviceType: 'dine_in' | 'takeaway' | 'delivery';
  user: User | null;
  token: string | null;
  discountType: DiscountType;
  setDiscountType: (type: DiscountType) => void;
  setDiscountCode: (code: string) => void;
  setAppliedDiscountCode: (applied: AppliedDiscountCode | null) => void;
  appliedDiscountCode: AppliedDiscountCode | null;
  discountAmount: number;
  editingOrderId: number | null;
  cashbackRedeemAmount: number;
  setCashbackRedeemAmount: (amount: number) => void;
  setCustomerAddress: (address: string) => void;
  discountCode: string;
  getTotalAmount: () => number;
  addFreeRewardToCart: (product: any, freeRewardTierId: number, redemptionId: number) => void;
  setDiscountAmount: (amount: number) => void;
}

export function useOrderModalState({
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
}: useOrderModalStateArgs) {
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [tables, setTables] = useState<PosTable[]>([]);
  /** میز خارج از سرویس برای ثبت سفارش قابل انتخاب نیست */
  const selectableTables = tables.filter(
    (t) => t.isActive !== false && t.status !== 'out_of_service',
  );
  const isElectronWithPrinters =
    typeof window !== 'undefined' && Boolean(window.electronAPI) && enabledPrinters.length > 0;
  const canUseDiscountCode = Boolean(customerPhone.trim()) && state.isOnline;
  const showCashBoxSelector =
    state.cashBoxAccounts.length > 1 &&
    (paymentMethod === 'cash' || paymentMethod === 'mixed' || paymentMethod === 'credit');

  const set = (patch: Partial<OrderModalState>) => setState((s) => ({ ...s, ...patch }));

  // Focus phone on open
  useEffect(() => {
    if (!state.isOpen) return;
    const t = setTimeout(() => phoneInputRef.current?.focus(), 50);
    const checkOnline = async () => {
      try {
        const online = window.electronAPI
          ? await window.electronAPI.checkOnline()
          : navigator.onLine;
        set({ isOnline: online });
      } catch {
        set({ isOnline: navigator.onLine });
      }
    };
    checkOnline();
    return () => clearTimeout(t);
  }, [state.isOpen]);

  // Reset card terminal when modal closes
  useEffect(() => {
    if (!state.isOpen)
      set({ cardTerminalStatus: 'idle', cardTerminalError: '', cardTerminalRefId: '' });
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
    const onlineCheck = window.electronAPI
      ? window.electronAPI.checkOnline()
      : Promise.resolve(navigator.onLine);
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
    return () => {
      cancelled = true;
    };
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
    if (!state.isOpen || !canUseDiscountCode) {
      set({ availableDiscountCodes: [] });
      return;
    }
    const restaurantName = user?.restaurants?.[0]?.name;
    if (!restaurantName) return;
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!isValidIranMobile(normalized)) {
      set({ availableDiscountCodes: [] });
      return;
    }
    let cancelled = false;
    set({ loadingAvailableDiscountCodes: true });
    getApplicableDiscountCodes({ restaurantName, phone: normalized }, token || undefined)
      .then((codes) => {
        if (cancelled) return;
        set({ availableDiscountCodes: codes });
        if (
          codes.length > 0 &&
          discountType !== 'code' &&
          !appliedDiscountCode &&
          discountAmount === 0 &&
          editingOrderId == null
        ) {
          setDiscountType('code');
        }
      })
      .catch(() => {
        if (!cancelled) set({ availableDiscountCodes: [] });
      })
      .finally(() => {
        if (!cancelled) set({ loadingAvailableDiscountCodes: false });
      });
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, canUseDiscountCode, customerPhone, token]);

  // موجودی کیف پول کش‌بک — مختص همین رستوران، هرگز رستوران دیگر درز نمی‌کند
  useEffect(() => {
    if (!state.isOpen || !state.isOnline) {
      set({ cashbackBalance: 0 });
      return;
    }
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
      .catch(() => {
        if (!cancelled) set({ cashbackBalance: 0 });
      })
      .finally(() => {
        if (!cancelled) set({ loadingCashback: false });
      });
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, state.isOnline, customerPhone, token, user?.restaurants]);

  // فعال‌بودن سامانهٔ کد معرف + دسترسی اپراتور — یک‌بار در باز شدن مودال.
  // شکست (۴۰۳ بدون دسترسی، غیرفعال، آفلاین) یعنی فیلد کد معرف اصلاً
  // نمایش داده نشود؛ بی‌صدا، بدون خطا به صندوق‌دار.
  useEffect(() => {
    if (!state.isOpen || !state.isOnline || !token) {
      set({ referralAvailable: false });
      return;
    }
    const restaurantId = user?.restaurants?.[0]?.id;
    if (!restaurantId) {
      set({ referralAvailable: false });
      return;
    }
    let cancelled = false;
    getReferralSettings(Number(restaurantId), token)
      .then(({ isEnabled }) => {
        if (!cancelled) set({ referralAvailable: !!isEnabled });
      })
      .catch(() => {
        if (!cancelled) set({ referralAvailable: false });
      });
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, state.isOnline, token, user?.restaurants]);

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
    if (!isValidIranMobile(normalized)) {
      set({ customerAddresses: [], selectedAddressId: null });
      return;
    }
    const restaurantId = user?.restaurants?.[0]?.id;
    const restaurantName = user?.restaurants?.[0]?.name;
    if (!restaurantId && !restaurantName) return;
    let cancelled = false;
    set({ loadingAddresses: true });
    const onlineCheck = window.electronAPI
      ? window.electronAPI.checkOnline()
      : Promise.resolve(navigator.onLine);
    onlineCheck.then((online) => {
      if (!online || cancelled) {
        set({ loadingAddresses: false });
        return;
      }
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
        .catch(() => {
          if (!cancelled) set({ customerAddresses: [], selectedAddressId: 'new' });
        })
        .finally(() => {
          if (!cancelled) set({ loadingAddresses: false });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, serviceType, customerPhone, token]);

  const handleCheckUser = async () => {
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (!isValidIranMobile(normalized)) {
      toast.error('فرمت شماره موبایل معتبر نیست');
      return;
    }
    set({ isCheckingUser: true, wheelVouchers: [] });
    try {
      const isOnline = window.electronAPI
        ? await window.electronAPI.checkOnline()
        : navigator.onLine;
      if (isOnline) {
        const restaurantId = user?.restaurants?.[0]?.id
          ? Number(user.restaurants[0].id)
          : undefined;
        const [response, vouchers] = await Promise.all([
          checkUser(normalized),
          restaurantId
            ? getWheelPrizeVouchers({ restaurantId, phone: normalized }, token ?? undefined)
            : Promise.resolve([]),
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
      {
        code,
        restaurantName: user.restaurants[0].name,
        totalAmount: getTotalAmount(),
        userPhone: customerPhone.trim() || undefined,
      },
      token,
    ).catch((err: any) => {
      set({
        discountCodeError: err?.response?.data?.message || err?.message || 'خطا در اعتبارسنجی',
      });
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
      if (result.rewardKind === 'free_item') {
        // برخلاف percent/fixed، این نوع جایزه دیگر کد تخفیف نمی‌سازد — خودِ
        // محصول در سبد رایگان می‌شود (اگر بود، یکی از واحدهایش؛ اگر نبود، اضافه می‌شود)
        addFreeRewardToCart(
          {
            id: result.productId,
            name_fa: result.productName,
            name: result.productName,
            price: result.price,
          },
          tier.id,
          result.redemptionId,
        );
        toast.success(result.message);
      } else {
        setDiscountType('code');
        setDiscountCode(result.discountCode);
        await handleApplyDiscountCode(result.discountCode);
        toast.success(result.message || `کد تخفیف ${result.discountCode} اعمال شد`);
      }
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
        setDiscountType('fixed');
        setDiscountAmount(disc);
        setAppliedDiscountCode(null);
        toast.success(`🎡 تخفیف ${voucher.prizeData?.percent}٪ اعمال شد`);
      } else if (voucher.prizeType === 'discount_amount') {
        const disc = Number(voucher.prizeData?.amount || 0);
        setDiscountType('fixed');
        setDiscountAmount(disc);
        setAppliedDiscountCode(null);
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

  return {
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
  };
}
