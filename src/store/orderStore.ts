import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export interface CartItem {
    productId: number;
    product: any;
    quantity: number;
    price: number;
    totalPrice: number;
    itemOption?: string;
}

type DiscountType = 'percentage' | 'fixed' | 'code';

export interface CartSession {
    id: string;
    label: string;
    cart: CartItem[];
    customerPhone: string;
    serviceType: 'dine_in' | 'takeaway';
    tableNumber: string;
    customerAddress: string;
    paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
    notes: string;
    discountAmount: number;
    discountType: DiscountType;
    discountCode: string;
    appliedDiscountCode: AppliedDiscountCode | null;
    splitCash: number;
    splitCard: number;
    splitOnline: number;
}

const MAX_SESSIONS = 3;

function createEmptySession(id: string, label: string): CartSession {
    return {
        id,
        label,
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
        splitCash: 0,
        splitCard: 0,
        splitOnline: 0,
    };
}

function getActiveSession(sessions: CartSession[], activeSessionId: string): CartSession {
    return sessions.find(s => s.id === activeSessionId) ?? sessions[0];
}

function calcTotalAmount(session: CartSession): number {
    return session.cart.reduce((sum, item) => sum + item.totalPrice, 0);
}

function calcDiscountAmount(session: CartSession): number {
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

function calcFinalAmount(session: CartSession): number {
    return Math.max(0, calcTotalAmount(session) - calcDiscountAmount(session));
}

interface OrderState {
  // ─── multi-session ───────────────────────────────────────────────────────
  sessions: CartSession[];
  activeSessionId: string;
  addSession: () => void;
  removeSession: (id: string) => void;
  switchSession: (id: string) => void;

  // ─── میانبرهای session فعال ──────────────────────────────────────────────
  cart: CartItem[];
  customerPhone: string;
  serviceType: 'dine_in' | 'takeaway';
  tableNumber: string;
  customerAddress: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  notes: string;
  discountAmount: number;
  discountType: DiscountType;
  discountCode: string;
  appliedDiscountCode: AppliedDiscountCode | null;
  isSubmitting: boolean;
  splitCash: number;
  splitCard: number;
  splitOnline: number;

  // ─── actions ─────────────────────────────────────────────────────────────
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

const INITIAL_SESSION_ID = 'session-1';

function syncActiveFieldsFromSession(session: CartSession): Pick<OrderState,
  'cart' | 'customerPhone' | 'serviceType' | 'tableNumber' | 'customerAddress' |
  'paymentMethod' | 'notes' | 'discountAmount' | 'discountType' | 'discountCode' |
  'appliedDiscountCode' | 'splitCash' | 'splitCard' | 'splitOnline'
> {
  return {
    cart: session.cart,
    customerPhone: session.customerPhone,
    serviceType: session.serviceType,
    tableNumber: session.tableNumber,
    customerAddress: session.customerAddress,
    paymentMethod: session.paymentMethod,
    notes: session.notes,
    discountAmount: session.discountAmount,
    discountType: session.discountType,
    discountCode: session.discountCode,
    appliedDiscountCode: session.appliedDiscountCode,
    splitCash: session.splitCash,
    splitCard: session.splitCard,
    splitOnline: session.splitOnline,
  };
}

const initialSession = createEmptySession(INITIAL_SESSION_ID, 'سبد ۱');

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => {
      /** به‌روزرسانی session فعال و sync کردن flat fields */
      const updateActive = (updater: (s: CartSession) => CartSession) => {
        const { sessions, activeSessionId } = get();
        const updated = sessions.map(s => s.id === activeSessionId ? updater(s) : s);
        const active = updated.find(s => s.id === activeSessionId) ?? updated[0];
        set({ sessions: updated, ...syncActiveFieldsFromSession(active) });
      };

      return {
        sessions: [initialSession],
        activeSessionId: INITIAL_SESSION_ID,
        isSubmitting: false,

        // flat fields (synced from active session)
        ...syncActiveFieldsFromSession(initialSession),

        // ─── session management ─────────────────────────────────────────────
        addSession: () => {
          const { sessions } = get();
          if (sessions.length >= MAX_SESSIONS) return;
          const newId = `session-${Date.now()}`;
          const label = `سبد ${sessions.length + 1}`;
          const newSession = createEmptySession(newId, label);
          set({
            sessions: [...sessions, newSession],
            activeSessionId: newId,
            ...syncActiveFieldsFromSession(newSession),
          });
        },

        removeSession: (id) => {
          const { sessions, activeSessionId } = get();
          if (sessions.length <= 1) return;
          const remaining = sessions.filter(s => s.id !== id);
          const relabeled = remaining.map((s, i) => ({ ...s, label: `سبد ${i + 1}` }));
          const newActiveId = activeSessionId === id ? relabeled[relabeled.length - 1].id : activeSessionId;
          const newActive = relabeled.find(s => s.id === newActiveId) ?? relabeled[0];
          set({ sessions: relabeled, activeSessionId: newActiveId, ...syncActiveFieldsFromSession(newActive) });
        },

        switchSession: (id) => {
          const { sessions } = get();
          const target = sessions.find(s => s.id === id);
          if (!target) return;
          set({ activeSessionId: id, ...syncActiveFieldsFromSession(target) });
        },

        // ─── cart actions ───────────────────────────────────────────────────
        addToCart: (product) => {
          updateActive(s => {
            const existing = s.cart.find(item => item.productId === product.id);
            if (existing) {
              return {
                ...s,
                cart: s.cart.map(item =>
                  item.productId === product.id
                    ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.price }
                    : item
                ),
              };
            }
            const unit = Number(product.price || 0);
            return {
              ...s,
              cart: [...s.cart, { productId: product.id, product, quantity: 1, price: unit, totalPrice: unit, itemOption: '' }],
            };
          });
        },

        updateCartQuantity: (productId, quantity) => {
          updateActive(s => ({
            ...s,
            cart: quantity <= 0
              ? s.cart.filter(item => item.productId !== productId)
              : s.cart.map(item =>
                  item.productId === productId
                    ? { ...item, quantity, totalPrice: quantity * item.price }
                    : item
                ),
          }));
        },

        updateCartItemOption: (productId, itemOption) => {
          updateActive(s => ({
            ...s,
            cart: s.cart.map(item =>
              item.productId === productId ? { ...item, itemOption: itemOption || '' } : item
            ),
          }));
        },

        removeFromCart: (productId) => {
          updateActive(s => ({ ...s, cart: s.cart.filter(item => item.productId !== productId) }));
        },

        setCustomerPhone: (customerPhone) => updateActive(s => ({ ...s, customerPhone })),
        setServiceType: (serviceType) => updateActive(s => ({ ...s, serviceType })),
        setTableNumber: (tableNumber) => updateActive(s => ({ ...s, tableNumber })),
        setCustomerAddress: (customerAddress) => updateActive(s => ({ ...s, customerAddress })),
        setPaymentMethod: (paymentMethod) => updateActive(s => ({ ...s, paymentMethod })),
        setNotes: (notes) => updateActive(s => ({ ...s, notes })),
        setDiscountAmount: (discountAmount) => updateActive(s => ({ ...s, discountAmount })),
        setDiscountType: (discountType) => updateActive(s => ({
          ...s,
          discountType,
          ...(discountType !== 'code' ? { appliedDiscountCode: null } : {}),
        })),
        setDiscountCode: (code) => updateActive(s => ({ ...s, discountCode: (code || '').trim() })),
        setAppliedDiscountCode: (appliedDiscountCode) => updateActive(s => ({ ...s, appliedDiscountCode })),
        setSplitCash: (splitCash) => updateActive(s => ({ ...s, splitCash: Math.max(0, splitCash) })),
        setSplitCard: (splitCard) => updateActive(s => ({ ...s, splitCard: Math.max(0, splitCard) })),
        setSplitOnline: (splitOnline) => updateActive(s => ({ ...s, splitOnline: Math.max(0, splitOnline) })),

        getSplitCreditAmount: () => {
          const { splitCash, splitCard, splitOnline } = get();
          return Math.max(0, get().getFinalAmount() - splitCash - splitCard - splitOnline);
        },

        restoreDraft: (draft) => {
          updateActive(s => ({
            ...s,
            cart: draft.cart,
            customerPhone: draft.customerPhone ?? '',
            serviceType: draft.serviceType ?? 'dine_in',
            tableNumber: draft.tableNumber ?? '',
            customerAddress: draft.customerAddress ?? '',
            paymentMethod: draft.paymentMethod ?? 'cash',
            notes: draft.notes ?? '',
          }));
        },

        clearCart: () => {
          updateActive(s => ({
            ...s,
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
          }));
        },

        getTotalAmount: () => {
          const { sessions, activeSessionId } = get();
          return calcTotalAmount(getActiveSession(sessions, activeSessionId));
        },

        getDiscountAmount: () => {
          const { sessions, activeSessionId } = get();
          return calcDiscountAmount(getActiveSession(sessions, activeSessionId));
        },

        getFinalAmount: () => {
          const { sessions, activeSessionId } = get();
          return calcFinalAmount(getActiveSession(sessions, activeSessionId));
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

          const { sessions, activeSessionId } = state;
          const session = getActiveSession(sessions, activeSessionId);
          const {
            cart, customerPhone, serviceType, tableNumber, customerAddress,
            paymentMethod, notes, discountType, discountCode, appliedDiscountCode,
            splitCash, splitCard, splitOnline,
          } = session;

          if (!token) return { success: false, error: 'لطفاً ابتدا وارد شوید' };
          if (cart.length === 0) return { success: false, error: 'سبد خرید خالی است' };

          const finalAmount = calcFinalAmount(session);
          const totalAmount = calcTotalAmount(session);
          const discountAmount = calcDiscountAmount(session);

          const mixedHasCredit = paymentMethod === 'mixed' &&
            (splitCash + splitCard + splitOnline) < finalAmount &&
            (splitCash + splitCard + splitOnline) > 0;

          if ((isMobileRequiredInElectronPanel || paymentMethod === 'credit' || mixedHasCredit) && !customerPhone.trim()) {
            return { success: false, error: 'برای سفارش دارای نسیه، شماره تماس مشتری الزامی است' };
          }
          if (customerPhone.trim() && !isValidIranMobile(customerPhone)) {
            return { success: false, error: 'فرمت شماره موبایل معتبر نیست. مثال: 09123456789' };
          }
          if (discountType === 'code' && discountCode.trim() && !appliedDiscountCode) {
            return { success: false, error: 'لطفاً با زدن «ثبت» کد تخفیف را اعمال کنید.' };
          }
          if (paymentMethod === 'mixed') {
            const total = splitCash + splitCard + splitOnline;
            if (total === 0) return { success: false, error: 'برای پرداخت ترکیبی، مبالغ روش‌های پرداخت را وارد کنید' };
            if (total > finalAmount) return { success: false, error: 'مجموع مبالغ پرداختی از مبلغ نهایی سفارش بیشتر است' };
          }
          if (paymentMethod === 'credit') {
            if (splitCash + splitCard + splitOnline > finalAmount) {
              return { success: false, error: 'مجموع مبالغ پرداختی از مبلغ نهایی سفارش بیشتر است' };
            }
          }

          set({ isSubmitting: true });

          const useDiscountCode = discountType === 'code' && (appliedDiscountCode?.code ?? discountCode.trim()).length > 0;
          const editingOrderId = options?.editingOrderId;

          const orderData: Record<string, unknown> = {
            customerPhone: normalizeIranMobile(customerPhone.trim()),
            customerAddress: serviceType === 'takeaway' ? customerAddress.trim() : undefined,
            tableNumber: serviceType === 'dine_in' ? tableNumber.trim() : undefined,
            serviceType,
            paymentMethod: mixedHasCredit ? 'credit' : paymentMethod,
            totalAmount,
            finalAmount: useDiscountCode ? totalAmount : finalAmount,
            discountAmount: useDiscountCode ? 0 : discountAmount,
            ...(useDiscountCode
              ? { discountCode: (appliedDiscountCode?.code ?? discountCode.trim()) }
              : editingOrderId != null
                ? { manualDiscountAmount: discountAmount }
                : {
                    manualDiscountAmount: discountAmount,
                    manualDiscountType: discountType,
                    manualDiscountValue: session.discountAmount,
                  }),
            notes: notes.trim() || undefined,
            restaurantName: user?.restaurants?.[0]?.name || '',
            ...(posWarehouseId ? { warehouseId: posWarehouseId } : {}),
            ...(paymentMethod === 'credit' || mixedHasCredit
              ? { creditPaidAmount: splitCash + splitCard + splitOnline }
              : {}),
            splitCash: splitCash > 0 ? splitCash : undefined,
            splitCard: splitCard > 0 ? splitCard : undefined,
            splitOnline: splitOnline > 0 ? splitOnline : undefined,
            items: cart.map(item => ({
              productId: item.productId,
              ...(editingOrderId == null ? {
                productName: item.product?.name_fa || item.product?.name || undefined,
                product: item.product ? { name_fa: item.product.name_fa, unit: item.product.unit } : undefined,
              } : {}),
              quantity: item.quantity,
              price: item.price,
              itemNote: item.itemOption?.trim() || undefined,
            })),
          };
          if (editingOrderId == null) orderData.status = 'confirmed';

          try {
            const isOnline = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;

            if (isOnline) {
              const latestToken = useAuthStore.getState().token;
              if (!latestToken) {
                set({ isSubmitting: false });
                return { success: false, error: 'نشست کاربری معتبر نیست. دوباره وارد شوید.' };
              }
              // ویرایش: منتظر پاسخ سرور می‌مانیم تا نتیجه را به caller برگردانیم
              if (editingOrderId != null) {
                try {
                  const response = await updateOrder(editingOrderId, orderData, latestToken);
                  const order = (response as any)?.data ?? response;
                  const acctWarn = typeof order?.accountingWarning === 'string' ? order.accountingWarning.trim() : '';
                  if (acctWarn) { onOrderFailed?.(acctWarn); set({ isSubmitting: false }); return { success: false, error: acctWarn }; }
                  set({ isSubmitting: false });
                  return { success: true, orderId: order.id ?? editingOrderId };
                } catch (error: any) {
                  const status = Number(error?.response?.status || 0);
                  const errorMessage = extractApiErrorMessage(error) || 'خطا در ویرایش سفارش';
                  if (status !== 401) onOrderFailed?.(errorMessage);
                  set({ isSubmitting: false });
                  return { success: false, error: errorMessage };
                }
              }

              // سفارش جدید: fire-and-forget برای سرعت پاسخ
              createOrder(orderData, latestToken)
                .then(async (response) => {
                  const order = (response as any)?.data ?? response;
                  const acctWarn = typeof order?.accountingWarning === 'string' ? order.accountingWarning.trim() : '';
                  if (acctWarn) { onOrderFailed?.(acctWarn); return; }
                  onOrderCreated?.({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    receiptCallNumber: order.receiptCallNumber,
                    offline: false,
                    order,
                  });
                })
                .catch(async (error: any) => {
                  const status = Number(error?.response?.status || 0);
                  const errorMessage = extractApiErrorMessage(error) || 'خطا در ثبت سفارش';
                  if (status === 401) { console.warn('Online submission failed with 401:', errorMessage); return; }
                  if (status === 400) { onOrderFailed?.(errorMessage); return; }
                  console.warn('Online submission failed, saving offline:', errorMessage);
                  try {
                    if (window.electronAPI) {
                      const freshToken = useAuthStore.getState().token || latestToken;
                      const res = await window.electronAPI.saveOfflineOrder(orderData, freshToken, API_BASE_URL);
                      if (res.success && res.orderId) { onOrderCreated?.({ orderId: res.orderId, offline: true }); return; }
                    }
                    const freshToken = useAuthStore.getState().token || latestToken;
                    const orderId = await saveOfflineOrder(orderData, freshToken, API_BASE_URL);
                    onOrderCreated?.({ orderId, offline: true });
                  } catch (_) { /* ignore */ }
                });
              set({ isSubmitting: false });
              return { success: true, pending: true };
            }

            // آفلاین — ویرایش فاکتور بدون اتصال ممکن نیست
            if (editingOrderId != null) {
              set({ isSubmitting: false });
              const msg = 'برای ویرایش فاکتور باید به اینترنت متصل باشید.';
              onOrderFailed?.(msg);
              return { success: false, error: msg };
            }

            let orderId: number;
            if (window.electronAPI) {
              const latestToken = useAuthStore.getState().token || token;
              const result = await window.electronAPI.saveOfflineOrder(orderData, latestToken, API_BASE_URL);
              if (result.success && result.orderId) {
                orderId = result.orderId;
              } else {
                orderId = await saveOfflineOrder(orderData, latestToken, API_BASE_URL);
              }
            } else {
              const latestToken = useAuthStore.getState().token || token;
              orderId = await saveOfflineOrder(orderData, latestToken, API_BASE_URL);
            }
            onOrderCreated?.({ orderId, offline: true });
            set({ isSubmitting: false });
            return { success: true, orderId, offline: true };
          } catch (error: any) {
            set({ isSubmitting: false });
            return { success: false, error: extractApiErrorMessage(error) };
          }
        },
      };
    },
    {
      name: 'order-sessions-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // sync flat fields after rehydrate
        const { sessions, activeSessionId } = state;
        const active = sessions.find(s => s.id === activeSessionId) ?? sessions[0];
        if (active) {
          Object.assign(state, syncActiveFieldsFromSession(active));
        }
      },
    }
  )
);
