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
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed';
  notes: string;
  discountAmount: number; // user input value (برای درصدی/تومانی)
  discountType: DiscountType;
  discountCode: string; // برای نوع «کد تخفیف»
  /** کد تخفیف ثبت‌شده (بعد از زدن «ثبت») — برای نمایش مبلغ و ارسال به سرور */
  appliedDiscountCode: AppliedDiscountCode | null;
  isSubmitting: boolean;
  addToCart: (product: any) => void;
  updateCartQuantity: (productId: number, quantity: number) => void;
  updateCartItemOption: (productId: number, itemOption: string) => void;
  removeFromCart: (productId: number) => void;
  setCustomerPhone: (phone: string) => void;
  setServiceType: (type: 'dine_in' | 'takeaway') => void;
  setTableNumber: (table: string) => void;
  setCustomerAddress: (address: string) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'online' | 'mixed') => void;
  setNotes: (notes: string) => void;
  setDiscountAmount: (amount: number) => void;
  setDiscountType: (type: DiscountType) => void;
  setDiscountCode: (code: string) => void;
  setAppliedDiscountCode: (applied: AppliedDiscountCode | null) => void;
  submitOrder: (options?: {
    editingOrderId?: number;
    onOrderCreated?: (result: { orderId: number; orderNumber?: string; receiptCallNumber?: number; offline?: boolean; order?: any }) => void;
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

    submitOrder: async (options) => {
        const state = get();
        const {token, user} = useAuthStore.getState();
        const onOrderCreated = options?.onOrderCreated;
        const restaurantName = user?.restaurants?.[0]?.name;
        const restaurantId = user?.restaurants?.[0]?.id;
        const cached = await getCachedMenu(restaurantId, restaurantName);
        const isMobileRequiredInElectronPanel = cached.isMobileRequiredInElectronPanel ?? true

        if (!token) {
            return {success: false, error: 'لطفاً ابتدا وارد شوید'};
        }

        if (state.cart.length === 0) {
            return {success: false, error: 'سبد خرید خالی است'};
        }

        if (isMobileRequiredInElectronPanel && !state.customerPhone.trim()) {
            return {success: false, error: 'شماره تماس مشتری الزامی است'};
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

        set({isSubmitting: true});

    const discountAmount = state.getDiscountAmount();
    const useDiscountCode = state.discountType === 'code' && (state.appliedDiscountCode?.code ?? state.discountCode.trim()).length > 0;
    const editingOrderId = options?.editingOrderId;
    const orderData: Record<string, unknown> = {
      customerPhone: normalizeIranMobile(state.customerPhone.trim()),
      customerAddress: state.serviceType === 'takeaway' ? state.customerAddress.trim() : undefined,
      tableNumber: state.serviceType === 'dine_in' ? state.tableNumber.trim() : undefined,
      serviceType: state.serviceType,
      paymentMethod: state.paymentMethod,
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
      items: state.cart.map(item => ({
        productId: item.productId,
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
        // ارسال در پس‌زمینه — بلافاصله موفق برگرد و چاپ وقتی جواب آمد
        createOrder(orderData, token)
          .then((response) => {
            onOrderCreated?.({
              orderId: response.id,
              orderNumber: response.orderNumber,
              receiptCallNumber: response.receiptCallNumber,
              offline: false,
              order: response,
            });
          })
          .catch(async (error: any) => {
            const status = Number(error?.response?.status || 0);
            if (status === 401) {
              // Let global 401 handler logout the session; do not store online-auth failures as offline orders.
              console.warn('Online submission failed with 401:', extractApiErrorMessage(error));
              return;
            }
            console.warn('Online submission failed, saving offline:', extractApiErrorMessage(error));
            const baseURL = API_BASE_URL;
            try {
              if (window.electronAPI) {
                const res = await window.electronAPI.saveOfflineOrder(orderData, token, baseURL);
                if (res.success && res.orderId) {
                  onOrderCreated?.({ orderId: res.orderId, offline: true });
                  return;
                }
              }
              const orderId = await saveOfflineOrder(orderData, token, baseURL);
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
                const result = await window.electronAPI.saveOfflineOrder(orderData, token, baseURL);
                if (result.success && result.orderId) {
                    orderId = result.orderId;
                } else {
                    orderId = await saveOfflineOrder(orderData, token, baseURL);
                }
            } else {
                orderId = await saveOfflineOrder(orderData, token, baseURL);
            }
            onOrderCreated?.({orderId, offline: true});
            set({isSubmitting: false});
            return {success: true, orderId, offline: true};
        } catch (error: any) {
            set({isSubmitting: false});
            return {success: false, error: extractApiErrorMessage(error)};
        }
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

