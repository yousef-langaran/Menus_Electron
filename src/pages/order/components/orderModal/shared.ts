import type { WheelPrizeVoucher, PointsRewardOption } from '../../../../services/api';

export const normalizePriceInput = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

export const formatPriceInput = (value: string) => {
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
  /** کد معرف — فقط برای مشتری جدید این رستوران نمایش داده می‌شود */
  referralCode: string;
  /**
   * آیا سامانهٔ کد معرف برای این رستوران فعال است و این اپراتور دسترسی
   * دارد؟ تا این تأیید نشود فیلد کد معرف اصلاً نمایش داده نمی‌شود —
   * نه الکی برای رستوران‌های بدون این قابلیت، نه خطای دسترسی برای
   * اپراتورهای بدون مجوز.
   */
  referralAvailable: boolean;
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
  availableDiscountCodes: import('../../../../services/api').DiscountCodeSummary[];
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
