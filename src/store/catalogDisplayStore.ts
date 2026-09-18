import { create } from 'zustand';

const STORAGE_KEY = 'app-show-product-images';

function getStoredShowProductImages(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === '1';
}

interface CatalogDisplayState {
  showProductImages: boolean;
  setShowProductImages: (value: boolean) => void;
}

/** ترجیح نمایش عکس محصول در گرید ثبت سفارش/سبد — کسب‌وکارهایی با اینترنت کند یا
    محصول بدون عکس ممکن است ترجیح بدهند این تصاویر برای سرعت بیشتر صندوق پنهان شوند */
export const useCatalogDisplayStore = create<CatalogDisplayState>((set) => ({
  showProductImages: getStoredShowProductImages(),
  setShowProductImages: (value: boolean) => {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    set({ showProductImages: value });
  },
}));
