import { create } from 'zustand';

/**
 * لیست شناسهٔ سفارش‌های آنلاین صفحهٔ جاری لیست سفارشات — تا میانبر ← / → در صفحهٔ
 * ثبت/ویرایش سفارش هم (نه فقط در خود لیست) بتواند بین فاکتور قبلی/بعدی جابه‌جا شود،
 * چون رفتن به /order?edit=<id> کامپوننت لیست را از DOM خارج می‌کند و شنوندهٔ کیبوردش
 * از بین می‌رود.
 */
type OrderNavState = {
  orderIds: number[];
  setOrderIds: (ids: number[]) => void;
};

export const useOrderNavStore = create<OrderNavState>((set) => ({
  orderIds: [],
  setOrderIds: (orderIds) => set({ orderIds }),
}));
