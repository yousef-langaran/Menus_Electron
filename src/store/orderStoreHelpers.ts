import { calculateVatAmount } from '../utils/vat';

export function extractApiErrorMessage(error: any): string {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'خطا در ارتباط با سرور'
  );
}

/** نتیجهٔ ثبت کد تخفیف (بعد از اعتبارسنجی) */
export interface AppliedDiscountCode {
  code: string;
  discountAmount: number;
}

export interface CartItem {
  productId: number;
  product: any;
  quantity: number;
  price: number;
  totalPrice: number;
  itemOption?: string;
  /**
   * فقط روی خطِ جایزهٔ «محصول رایگان» ست می‌شود (free_item_category/
   * free_specific_item از کاتالوگ امتیاز) — آیدی تیر جایزه‌ای که این واحد را
   * رایگان کرد. این خط عمداً از خط عادی/پولیِ همان محصول جداست (حتی اگر
   * productId یکسان باشد) تا «قبلاً ۲ تا پولی داشت، یکی‌شان رایگان شد» قابل
   * نمایش/محاسبه بماند؛ نگاه کنید addFreeRewardToCart.
   */
  freeRewardTierId?: number;
  /**
   * آیدیِ مصرف(های) بک‌اند (`PointsRewardRedemption.id`) پشتِ واحدهای این
   * خط رایگان — طولش با quantity یکی است. لازم است تا وقتی این خط از سبد
   * حذف می‌شود، بشود امتیازِ کسرشده را با `cancelPointsReward` برگرداند؛
   * نگاه کنید OrderCart.tsx#handleRemoveFreeLine.
   */
  freeRedemptionIds?: number[];
}

export type DiscountType = 'percentage' | 'fixed' | 'code';

export interface CartSession {
  id: string;
  label: string;
  cart: CartItem[];
  customerPhone: string;
  serviceType: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber: string;
  /** شناسهٔ میز از «مدیریت میزها» — null یعنی میز متنی یا تعریف‌نشده */
  tableId: number | null;
  customerAddress: string;
  deliveryLocation: { lat: number; lng: number } | null;
  deliveryFeeOverride: number | null;
  deliveryFeeReason: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  notes: string;
  discountAmount: number;
  discountType: DiscountType;
  discountCode: string;
  appliedDiscountCode: AppliedDiscountCode | null;
  /** مبلغی از کیف پول کش‌بک مشتری که برای همین سفارش خرج می‌شود (ریال) */
  cashbackRedeemAmount: number;
  splitCash: number;
  splitCard: number;
  splitOnline: number;
}

export const MAX_SESSIONS = 3;

export function createEmptySession(id: string, label: string): CartSession {
  return {
    id,
    label,
    cart: [],
    customerPhone: '',
    serviceType: 'dine_in',
    tableNumber: '',
    tableId: null,
    customerAddress: '',
    deliveryLocation: null,
    deliveryFeeOverride: null,
    deliveryFeeReason: '',
    paymentMethod: 'cash',
    notes: '',
    discountAmount: 0,
    discountType: 'fixed',
    discountCode: '',
    appliedDiscountCode: null,
    cashbackRedeemAmount: 0,
    splitCash: 0,
    splitCard: 0,
    splitOnline: 0,
  };
}

export function getActiveSession(sessions: CartSession[], activeSessionId: string): CartSession {
  return sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
}

export function calcTotalAmount(session: CartSession): number {
  return session.cart.reduce((sum, item) => sum + item.totalPrice, 0);
}

export function calcDiscountAmount(session: CartSession): number {
  if (session.discountType === 'code') {
    return session.appliedDiscountCode ? session.appliedDiscountCode.discountAmount : 0;
  }
  const total = calcTotalAmount(session);
  const discountValue = session.discountAmount;
  if (!discountValue || discountValue <= 0) return 0;
  if (session.discountType === 'percentage') {
    const pct = Math.min(discountValue, 100);
    return Math.min(total, (total * pct) / 100);
  }
  return Math.min(total, discountValue);
}

/**
 * ارزش افزوده فقط روی خطوطی که دستهٔ محصولشان مشمول است — و پس از کسر سهم
 * تخفیف. روی قیمت نمایشی محصول در سبد اثری ندارد و صرفاً به مبلغ قابل
 * پرداخت افزوده می‌شود.
 */
export function calcVatAmount(session: CartSession, vatRate: number | null): number {
  return calculateVatAmount(
    session.cart.map((item) => ({
      lineTotal: item.totalPrice,
      hasVat: Boolean(item.product?.category?.hasVat),
    })),
    calcTotalAmount(session),
    calcDiscountAmount(session),
    vatRate,
  );
}

/**
 * کش‌بک بعد از ارزش افزوده کسر می‌شود — یک ابزار پرداخت (اعتبار کیف پول)
 * است نه تخفیف روی قیمت کالا، دقیقاً همان فرمول سمت سرور در orders.service.ts
 */
export function calcFinalAmount(session: CartSession, vatRate: number | null): number {
  const beforeCashback =
    Math.max(0, calcTotalAmount(session) - calcDiscountAmount(session)) +
    calcVatAmount(session, vatRate);
  return Math.max(0, beforeCashback - (session.cashbackRedeemAmount || 0));
}

export interface OrderState {
  // ─── multi-session ───────────────────────────────────────────────────────
  sessions: CartSession[];
  activeSessionId: string;
  addSession: () => void;
  removeSession: (id: string) => void;
  switchSession: (id: string) => void;

  // ─── میانبرهای session فعال ──────────────────────────────────────────────
  cart: CartItem[];
  customerPhone: string;
  serviceType: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber: string;
  tableId: number | null;
  customerAddress: string;
  /** مختصات تأییدشدهٔ مقصد — null یعنی هنوز روی نقشه مشخص نشده */
  deliveryLocation: { lat: number; lng: number } | null;
  /** کرایهٔ دستی (ریال) — وقتی کرایهٔ خودکار در دسترس نیست */
  deliveryFeeOverride: number | null;
  deliveryFeeReason: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  notes: string;
  discountAmount: number;
  discountType: DiscountType;
  discountCode: string;
  appliedDiscountCode: AppliedDiscountCode | null;
  cashbackRedeemAmount: number;
  isSubmitting: boolean;
  splitCash: number;
  splitCard: number;
  splitOnline: number;
  /**
   * نرخ ارزش افزودهٔ رستوران (درصد) — از تنظیمات پنل می‌آید و صندوق آن را
   * کش می‌کند تا محاسبهٔ آفلاین هم ممکن باشد. null یعنی هنوز خوانده نشده و
   * نرخ پیش‌فرض به‌کار می‌رود.
   */
  vatRate: number | null;

  // ─── actions ─────────────────────────────────────────────────────────────
  addToCart: (product: any) => void;
  updateCartQuantity: (productId: number, quantity: number) => void;
  updateCartItemOption: (productId: number, itemOption: string) => void;
  removeFromCart: (productId: number, freeRewardTierId?: number) => void;
  /**
   * اعمال جایزهٔ «محصول رایگان» روی سبد: اگر خطِ پولیِ همین محصول در سبد
   * باشد، یکی از واحدهایش را رایگان می‌کند (خط پولی یکی کم می‌شود/حذف
   * می‌شود)؛ اگر نبود، یک خطِ رایگانِ جدید با تعداد ۱ اضافه می‌کند. مصرف دوبارهٔ
   * همان تیر روی همان محصول فقط تعداد خط رایگان را زیاد می‌کند.
   */
  addFreeRewardToCart: (product: any, freeRewardTierId: number, redemptionId: number) => void;
  setCustomerPhone: (phone: string) => void;
  setServiceType: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
  setTableNumber: (table: string) => void;
  /** انتخاب میز از فهرست میزهای رستوران — نام میز هم همگام می‌شود */
  setTable: (table: { id: number; name: string } | null) => void;
  setCustomerAddress: (address: string) => void;
  setDeliveryLocation: (location: { lat: number; lng: number } | null) => void;
  setDeliveryFeeOverride: (fee: number | null) => void;
  setDeliveryFeeReason: (reason: string) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'online' | 'mixed' | 'credit') => void;
  setNotes: (notes: string) => void;
  setDiscountAmount: (amount: number) => void;
  setDiscountType: (type: DiscountType) => void;
  setDiscountCode: (code: string) => void;
  setAppliedDiscountCode: (applied: AppliedDiscountCode | null) => void;
  setCashbackRedeemAmount: (amount: number) => void;
  setSplitCash: (amount: number) => void;
  setSplitCard: (amount: number) => void;
  setSplitOnline: (amount: number) => void;
  getSplitCreditAmount: () => number;
  restoreDraft: (draft: {
    cart: CartItem[];
    customerPhone?: string;
    serviceType?: 'dine_in' | 'takeaway' | 'delivery';
    tableNumber?: string;
    tableId?: number | null;
    customerAddress?: string;
    paymentMethod?: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
    notes?: string;
  }) => void;
  submitOrder: (options?: {
    editingOrderId?: number;
    onOrderCreated?: (result: {
      orderId: number;
      orderNumber?: string;
      receiptCallNumber?: number;
      offline?: boolean;
      order?: any;
    }) => void;
    onOrderFailed?: (error: string) => void;
  }) => Promise<{
    success: boolean;
    orderId?: number;
    orderNumber?: string;
    receiptCallNumber?: number;
    error?: string;
    offline?: boolean;
    pending?: boolean;
  }>;
  clearCart: () => void;
  setVatRate: (rate: number | null) => void;
  getTotalAmount: () => number;
  getFinalAmount: () => number;
  getDiscountAmount: () => number;
  getVatAmount: () => number;
}

export const INITIAL_SESSION_ID = 'session-1';

export function syncActiveFieldsFromSession(
  session: CartSession,
): Pick<
  OrderState,
  | 'cart'
  | 'customerPhone'
  | 'serviceType'
  | 'tableNumber'
  | 'tableId'
  | 'customerAddress'
  | 'deliveryLocation'
  | 'deliveryFeeOverride'
  | 'deliveryFeeReason'
  | 'paymentMethod'
  | 'notes'
  | 'discountAmount'
  | 'discountType'
  | 'discountCode'
  | 'appliedDiscountCode'
  | 'cashbackRedeemAmount'
  | 'splitCash'
  | 'splitCard'
  | 'splitOnline'
> {
  return {
    cart: session.cart,
    customerPhone: session.customerPhone,
    serviceType: session.serviceType,
    deliveryLocation: session.deliveryLocation ?? null,
    deliveryFeeOverride: session.deliveryFeeOverride ?? null,
    deliveryFeeReason: session.deliveryFeeReason ?? '',
    tableNumber: session.tableNumber,
    tableId: session.tableId ?? null,
    customerAddress: session.customerAddress,
    paymentMethod: session.paymentMethod,
    notes: session.notes,
    discountAmount: session.discountAmount,
    discountType: session.discountType,
    discountCode: session.discountCode,
    appliedDiscountCode: session.appliedDiscountCode,
    cashbackRedeemAmount: session.cashbackRedeemAmount,
    splitCash: session.splitCash,
    splitCard: session.splitCard,
    splitOnline: session.splitOnline,
  };
}
