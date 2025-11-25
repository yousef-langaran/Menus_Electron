import { create } from 'zustand';
import { saveOfflineOrder } from '../services/offlineStorage';
import { createOrder, API_BASE_URL } from '../services/api';
import { useAuthStore } from './authStore';

interface CartItem {
  productId: number;
  product: any;
  quantity: number;
  price: number;
  totalPrice: number;
}

type DiscountType = 'percentage' | 'fixed';

interface OrderState {
  cart: CartItem[];
  customerPhone: string;
  serviceType: 'dine_in' | 'takeaway';
  tableNumber: string;
  customerAddress: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed';
  notes: string;
  discountAmount: number; // user input value
  discountType: DiscountType;
  isSubmitting: boolean;
  addToCart: (product: any) => void;
  updateCartQuantity: (productId: number, quantity: number) => void;
  removeFromCart: (productId: number) => void;
  setCustomerPhone: (phone: string) => void;
  setServiceType: (type: 'dine_in' | 'takeaway') => void;
  setTableNumber: (table: string) => void;
  setCustomerAddress: (address: string) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'online' | 'mixed') => void;
  setNotes: (notes: string) => void;
  setDiscountAmount: (amount: number) => void;
  setDiscountType: (type: DiscountType) => void;
  submitOrder: () => Promise<{ success: boolean; orderId?: number; error?: string }>;
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
      set({
        cart: [
          ...cart,
          {
            productId: product.id,
            product,
            quantity: 1,
            price: product.price,
            totalPrice: product.price,
          },
        ],
      });
    }
  },

  updateCartQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      set({ cart: get().cart.filter(item => item.productId !== productId) });
    } else {
      set({
        cart: get().cart.map(item =>
          item.productId === productId
            ? { ...item, quantity, totalPrice: quantity * item.price }
            : item
        ),
      });
    }
  },

  removeFromCart: (productId) => {
    set({ cart: get().cart.filter(item => item.productId !== productId) });
  },

  setCustomerPhone: (phone) => set({ customerPhone: phone }),
  setServiceType: (type) => set({ serviceType: type }),
  setTableNumber: (table) => set({ tableNumber: table }),
  setCustomerAddress: (address) => set({ customerAddress: address }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setNotes: (notes) => set({ notes }),
  setDiscountAmount: (amount) => set({ discountAmount: amount }),
  setDiscountType: (type) => set({ discountType: type }),

  submitOrder: async () => {
    const state = get();
    const { token, user } = useAuthStore.getState();
    
    if (!token) {
      return { success: false, error: 'لطفاً ابتدا وارد شوید' };
    }

    if (state.cart.length === 0) {
      return { success: false, error: 'سبد خرید خالی است' };
    }

    if (!state.customerPhone.trim()) {
      return { success: false, error: 'شماره تماس مشتری الزامی است' };
    }

    if (state.serviceType === 'dine_in' && !state.tableNumber.trim()) {
      return { success: false, error: 'شماره میز الزامی است' };
    }

    if (state.serviceType === 'takeaway' && !state.customerAddress.trim()) {
      return { success: false, error: 'آدرس الزامی است' };
    }

    set({ isSubmitting: true });

    const discountAmount = state.getDiscountAmount();
    const orderData = {
      customerPhone: state.customerPhone.trim(),
      customerAddress: state.serviceType === 'takeaway' ? state.customerAddress.trim() : undefined,
      tableNumber: state.serviceType === 'dine_in' ? state.tableNumber.trim() : undefined,
      serviceType: state.serviceType,
      paymentMethod: state.paymentMethod,
      totalAmount: state.getTotalAmount(),
      finalAmount: state.getFinalAmount(),
      discountAmount,
      manualDiscountAmount: discountAmount,
      manualDiscountType: state.discountType,
      manualDiscountValue: state.discountAmount,
      notes: state.notes.trim() || undefined,
      restaurantName: user?.restaurants?.[0]?.name || '',
      items: state.cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
      status: 'confirmed',
    };

    try {
      const isOnline = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;
      
      if (isOnline) {
        // Try to submit online
        try {
          const response = await createOrder(orderData, token);
          set({ isSubmitting: false });
          return { success: true, orderId: response.id };
        } catch (error: any) {
          // If online submission fails, save offline
          console.warn('Online submission failed, saving offline:', error);
        }
      }

      // Save offline
      let orderId: number;
      const baseURL = API_BASE_URL;
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
      set({ isSubmitting: false });
      return { success: true, orderId, offline: true };
    } catch (error: any) {
      set({ isSubmitting: false });
      return { success: false, error: error.message || 'خطا در ثبت سفارش' };
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
    });
  },

  getTotalAmount: () => {
    return get().cart.reduce((sum, item) => sum + item.totalPrice, 0);
  },

  getDiscountAmount: () => {
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

