import { create } from 'zustand';
import { saveOfflineOrder } from '../services/offlineStorage';
import { createOrder, updateOrder, API_BASE_URL } from '../services/api';
import { useAuthStore } from './authStore';
import {getCachedMenu} from "@/services/cache.ts";
import { isValidIranMobile, normalizeIranMobile } from '../utils/iranMobile';

function extractApiErrorMessage(error: any): string {
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

interface CartItem {
    productId: number;
    product: any;
    quantity: number;
    price: number;
    totalPrice: number;
    itemOption?: string;
}

type DiscountType = 'percentage' | 'fixed' | 'code';

interface OrderState {
  cart: CartItem[];
  customerPhone: string;
  serviceType: 'dine_in' | 'takeaway';
  tableNumber: string;
  customerAddress: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  notes: string;
  discountAmount: number; // user input value (برای درصدی/تومانی)
  discountType: DiscountType;
  discountCode: string; // برای نوع «کد تخفیف»
  /** کد تخفیف ثبت‌شده (بعد از زدن «ثبت») — برای نمایش مبلغ و ارسال به سرور */
  appliedDiscountCode: AppliedDiscountCode | null;
  isSubmitting: boolean;
  /** تقسیم پرداخت برای سفارشات اعتباری ترکیبی */
  splitCash: number;
  splitCard: number;
  splitOnline: number;
  addToCart: (product: any) => void;
  updateCartQuantity: (productId: number, quantity: number) => void;
  updateCartItemOption: (productId: number, itemOption: string) => void;
  removeFromCart: (productId: number) => void;
  setCustomerPhone: (phone: string) => void;
  setServiceType: (type: 'dine_in' | 'takeaway') => void;
  setTableNumber: (table: string) => void;
  setCustomerAddress: (address: string) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'online' | 'mixed' | 'credit') => void;
  setNotes: (notes: string) => void;
  setDiscountAmount: (amount: number) => void;
  setDiscountType: (type: DiscountType) => void;
  setDiscountCode: (code: string) => void;
  setAppliedDiscountCode: (applied: AppliedDiscountCode | null) => void;
  setSplitCash: (amount: number) => void;
  setSplitCard: (amount: number) => void;
  setSplitOnline: (amount: number) => void;
  getSplitCreditAmount: () => number;
  restoreDraft: (draft: {
    cart: CartItem[];
    customerPhone?: string;
    serviceType?: 'dine_in' | 'takeaway';
    tableNumber?: string;
    customerAddress?: string;
    paymentMethod?: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
    notes?: string;
  }) => void;
  submitOrder: (options?: {
    editingOrderId?: number;
    onOrderCreated?: (result: { orderId: number; orderNumber?: string; receiptCallNumber?: number; offline?: boolean; order?: any }) => void;
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
  getTotalAmount: () => number;
  getFinalAmount: () => number;
  getDiscountAmount: () => number;
}

export const useOrderStore = create<OrderState>((set, get) => ({
    cart: [],
    customerPhone: '',
    serviceType: 'dine_in',
    tableNumber: '',
    customerAddress: '',
    paymentMethod: 'cash',
    notes: '',
    discountAmount: 0,
    discountType: 'fixed',
    discountCode: '',
    appliedDiscountCode: null,
    isSubmitting: false,
    splitCash: 0,
    splitCard: 0,
    splitOnline: 0,

    addToCart: (product) => {
        const cart = get().cart;
        const existingItem = cart.find(item => item.productId === product.id);

        if (existingItem) {
            set({
                cart: cart.map(item =>
                    item.productId === product.id
                        ? {
                            ...item,
                            quantity: item.quantity + 1,
                            totalPrice: (item.quantity + 1) * item.price,
                        }
                        : item
                ),
            });
        } else {
            const unit = Number(
                (product as { staffOrderUnitPrice?: number }).staffOrderUnitPrice ?? product.price ?? 0,
            );
            set({
                cart: [
                    ...cart,
                    {
                        productId: product.id,
                        product,
                        quantity: 1,
                        price: unit,
                        totalPrice: unit,
                        itemOption: '',
                    },
                ],
            });
        }
    },

    updateCartQuantity: (productId, quantity) => {
        if (quantity <= 0) {
            set({cart: get().cart.filter(item => item.productId !== productId)});
        } else {
            set({
                cart: get().cart.map(item =>
                    item.productId === productId
                        ? {...item, quantity, totalPrice: quantity * item.price}
                        : item
                ),
            });
        }
    },

    updateCartItemOption: (productId, itemOption) => {
        set({
            cart: get().cart.map(item =>
                item.productId === productId ? {...item, itemOption: itemOption || ''} : item
            ),
        });
    },

    removeFromCart: (productId) => {
        set({cart: get().cart.filter(item => item.productId !== productId)});
    },

    setCustomerPhone: (phone) => set({customerPhone: phone}),
    setServiceType: (type) => set({serviceType: type}),
    setTableNumber: (table) => set({tableNumber: table}),
    setCustomerAddress: (address) => set({customerAddress: address}),
    setPaymentMethod: (method) => set({paymentMethod: method}),
    setNotes: (notes) => set({notes}),
    setDiscountAmount: (amount) => set({discountAmount: amount}),
    setDiscountType: (type) => set({discountType: type, ...(type !== 'code' ? {appliedDiscountCode: null} : {})}),
    setDiscountCode: (code) => set({discountCode: (code || '').trim()}),
    setAppliedDiscountCode: (applied) => set({appliedDiscountCode: applied}),
    setSplitCash: (amount) => set({splitCash: Math.max(0, amount)}),
    setSplitCard: (amount) => set({splitCard: Math.max(0, amount)}),
    setSplitOnline: (amount) => set({splitOnline: Math.max(0, amount)}),
    getSplitCreditAmount: () => {
        const { splitCash, splitCard, splitOnline } = get();
        const final = get().getFinalAmount();
        return Math.max(0, final - splitCash - splitCard - splitOnline);
    },

    submitOrder: async (options) => {
        const state = get();
        const authState = useAuthStore.getState();
        const token = authState.token;
        const user = authState.user;
        const onOrderCreated = options?.onOrderCreated;
        const onOrderFailed = options?.onOrderFailed;
        const restaurantName = user?.restaurants?.[0]?.name;
        const restaurantId = user?.restaurants?.[0]?.id;
        const cached = await getCachedMenu(restaurantId, restaurantName);
        const isMobileRequiredInElectronPanel = cached.isMobileRequiredInElectronPanel ?? true;
        const posWarehouseId: number | null = window.electronAPI?.getPosWarehouseId
          ? await window.electronAPI.getPosWarehouseId()
          : null;

        if (!token) {
            return {success: false, error: 'لطفاً ابتدا وارد شوید'};
        }

        if (state.cart.length === 0) {
            return {success: false, error: 'سبد خرید خالی است'};
        }

        const mixedHasCredit = state.paymentMethod === 'mixed' &&
            (state.splitCash + state.splitCard + state.splitOnline) < state.getFinalAmount() &&
            (state.splitCash + state.splitCard + state.splitOnline) > 0;
        if ((isMobileRequiredInElectronPanel || state.paymentMethod === 'credit' || mixedHasCredit) && !state.customerPhone.trim()) {
            return {success: false, error: 'برای سفارش دارای نسیه، شماره تماس مشتری الزامی است'};
        }
        if (state.customerPhone.trim() && !isValidIranMobile(state.customerPhone)) {
            return {success: false, error: 'فرمت شماره موبایل معتبر نیست. مثال: 09123456789'};
        }

        // if (state.serviceType === 'takeaway' && !state.customerAddress.trim()) {
        //     return {success: false, error: 'آدرس الزامی است'};
        // }

        if (state.discountType === 'code' && state.discountCode.trim() && !state.appliedDiscountCode) {
            return {success: false, error: 'لطفاً با زدن «ثبت» کد تخفیف را اعمال کنید.'};
        }

        if (state.paymentMethod === 'mixed') {
            const total = state.splitCash + state.splitCard + state.splitOnline;
            const final = state.getFinalAmount();
            if (total === 0) {
                return {success: false, error: 'برای پرداخت ترکیبی، مبالغ روش‌های پرداخت را وارد کنید'};
            }
            if (total > final) {
                return {success: false, error: 'مجموع مبالغ پرداختی از مبلغ نهایی سفارش بیشتر است'};
            }
        }
        if (state.paymentMethod === 'credit') {
            const preAmt = state.splitCash + state.splitCard + state.splitOnline;
            if (preAmt > state.getFinalAmount()) {
                return {success: false, error: 'مجموع مبالغ پرداختی از مبلغ نهایی سفارش بیشتر است'};
            }
        }

        const capturedPaymentData = {
          paymentMethod: (mixedHasCredit ? 'credit' : state.paymentMethod) as 'cash' | 'card' | 'online' | 'mixed' | 'credit',
          finalAmount: state.getFinalAmount(),
          splitCash: state.splitCash,
          splitCard: state.splitCard,
          splitOnline: state.splitOnline,
          mixedHasCredit,
          customerPhone: state.customerPhone,
        };

        set({isSubmitting: true});

    const discountAmount = state.getDiscountAmount();
    const useDiscountCode = state.discountType === 'code' && (state.appliedDiscountCode?.code ?? state.discountCode.trim()).length > 0;
    const editingOrderId = options?.editingOrderId;
    const orderData: Record<string, unknown> = {
      customerPhone: normalizeIranMobile(state.customerPhone.trim()),
      customerAddress: state.serviceType === 'takeaway' ? state.customerAddress.trim() : undefined,
      tableNumber: state.serviceType === 'dine_in' ? state.tableNumber.trim() : undefined,
      serviceType: state.serviceType,
      paymentMethod: mixedHasCredit ? 'credit' : state.paymentMethod,
      totalAmount: state.getTotalAmount(),
      finalAmount: useDiscountCode ? state.getTotalAmount() : state.getFinalAmount(),
      discountAmount: useDiscountCode ? 0 : discountAmount,
      ...(useDiscountCode
        ? { discountCode: (state.appliedDiscountCode?.code ?? state.discountCode.trim()) }
        : {
            manualDiscountAmount: discountAmount,
            manualDiscountType: state.discountType,
            manualDiscountValue: state.discountAmount,
          }),
      notes: state.notes.trim() || undefined,
      restaurantName: user?.restaurants?.[0]?.name || '',
      ...(posWarehouseId ? { warehouseId: posWarehouseId } : {}),
      ...(state.paymentMethod === 'credit' || mixedHasCredit
        ? { creditPaidAmount: state.splitCash + state.splitCard + state.splitOnline }
        : {}),
      items: state.cart.map(item => ({
        productId: item.productId,
        productName: item.product?.name_fa || item.product?.name || undefined,
        product: item.product
          ? { name_fa: item.product.name_fa, unit: item.product.unit }
          : undefined,
        quantity: item.quantity,
        price: item.price,
        itemNote: item.itemOption?.trim() || undefined,
      })),
    };
    if (editingOrderId == null) {
      orderData.status = 'confirmed';
    }

        try {
            const isOnline = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;

      if (isOnline) {
        const latestToken = useAuthStore.getState().token;
        if (!latestToken) {
          set({ isSubmitting: false });
          return { success: false, error: 'نشست کاربری معتبر نیست. دوباره وارد شوید.' };
        }
        // ارسال در پس‌زمینه — بلافاصله موفق برگرد و چاپ وقتی جواب آمد
        // برای ویرایش فاکتور از updateOrder استفاده می‌شود؛ برای سفارش جدید از createOrder
        const apiCall = editingOrderId != null
          ? updateOrder(editingOrderId, orderData, latestToken)
          : createOrder(orderData, latestToken);

        apiCall
          .then(async (response) => {
            const order = (response as any)?.data ?? response;
            const acctWarn =
              typeof order?.accountingWarning === 'string'
                ? order.accountingWarning.trim()
                : '';
            if (acctWarn) {
              onOrderFailed?.(acctWarn);
              return;
            }
            onOrderCreated?.({
              orderId: order.id ?? editingOrderId,
              orderNumber: order.orderNumber,
              receiptCallNumber: order.receiptCallNumber,
              offline: false,
              order,
            });
            // Record payment transactions to local cash accounts ledger
            try {
              const { recordOrderPaymentTransactions } = await import('../services/accountingLocalDb');
              const rid = Number(useAuthStore.getState().user?.restaurants?.[0]?.id || 0);
              if (rid) {
                await recordOrderPaymentTransactions({
                  restaurantId: rid,
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  customerPhone: capturedPaymentData.customerPhone || undefined,
                  paymentMethod: capturedPaymentData.paymentMethod,
                  finalAmount: capturedPaymentData.finalAmount,
                  splitCash: capturedPaymentData.splitCash,
                  splitCard: capturedPaymentData.splitCard,
                  splitOnline: capturedPaymentData.splitOnline,
                  mixedHasCredit: capturedPaymentData.mixedHasCredit,
                });
              }
            } catch (txErr) {
              console.warn('[CashAccounts] Failed to record transaction:', txErr);
            }
          })
          .catch(async (error: any) => {
            const status = Number(error?.response?.status || 0);
            const errorMessage = extractApiErrorMessage(error) || 'خطا در ثبت سفارش';
            if (status === 401) {
              // Let global 401 handler logout the session; do not store online-auth failures as offline orders.
              console.warn('Online submission failed with 401:', errorMessage);
              return;
            }
            // ویرایش فاکتور آفلاین ممکن نیست — خطا را نمایش بده
            if (status === 400 || editingOrderId != null) {
              onOrderFailed?.(errorMessage);
              return;
            }
            console.warn('Online submission failed, saving offline:', errorMessage);
            const baseURL = API_BASE_URL;
            try {
              if (window.electronAPI) {
                const freshToken = useAuthStore.getState().token || latestToken;
                const res = await window.electronAPI.saveOfflineOrder(orderData, freshToken, baseURL);
                if (res.success && res.orderId) {
                  onOrderCreated?.({ orderId: res.orderId, offline: true });
                  return;
                }
              }
              const freshToken = useAuthStore.getState().token || latestToken;
              const orderId = await saveOfflineOrder(orderData, freshToken, baseURL);
              onOrderCreated?.({ orderId, offline: true });
            } catch (_) {
              // ignore
            }
          });
        set({ isSubmitting: false });
        return { success: true, pending: true };
      }

            // آفلاین: ذخیره و برگرد (سریع)
            const baseURL = API_BASE_URL;
            let orderId: number;
            if (window.electronAPI) {
                const latestToken = useAuthStore.getState().token || token;
                const result = await window.electronAPI.saveOfflineOrder(orderData, latestToken, baseURL);
                if (result.success && result.orderId) {
                    orderId = result.orderId;
                } else {
                    orderId = await saveOfflineOrder(orderData, latestToken, baseURL);
                }
            } else {
                const latestToken = useAuthStore.getState().token || token;
                orderId = await saveOfflineOrder(orderData, latestToken, baseURL);
            }
            onOrderCreated?.({orderId, offline: true});
            set({isSubmitting: false});
            return {success: true, orderId, offline: true};
        } catch (error: any) {
            set({isSubmitting: false});
            return {success: false, error: extractApiErrorMessage(error)};
        }
    },

    restoreDraft: (draft) => {
        set({
            cart: draft.cart,
            customerPhone: draft.customerPhone ?? '',
            serviceType: draft.serviceType ?? 'dine_in',
            tableNumber: draft.tableNumber ?? '',
            customerAddress: draft.customerAddress ?? '',
            paymentMethod: draft.paymentMethod ?? 'cash',
            notes: draft.notes ?? '',
        });
    },

    clearCart: () => {
        set({
            cart: [],
            customerPhone: '',
            tableNumber: '',
            customerAddress: '',
            notes: '',
            discountAmount: 0,
            discountType: 'fixed',
            discountCode: '',
            appliedDiscountCode: null,
            splitCash: 0,
            splitCard: 0,
            splitOnline: 0,
        });
    },

    getTotalAmount: () => {
        return get().cart.reduce((sum, item) => sum + item.totalPrice, 0);
    },

    getDiscountAmount: () => {
        if (get().discountType === 'code') {
            const applied = get().appliedDiscountCode;
            return applied ? applied.discountAmount : 0;
        }
        const total = get().getTotalAmount();
        const discountValue = get().discountAmount;
        if (!discountValue || discountValue <= 0) {
            return 0;
        }
        if (get().discountType === 'percentage') {
            const percentage = Math.min(discountValue, 100);
            return Math.min(total, (total * percentage) / 100);
        }
        return Math.min(total, discountValue);
    },

    getFinalAmount: () => {
        const total = get().getTotalAmount();
        const discount = get().getDiscountAmount();
        return Math.max(0, total - discount);
    },
}));

