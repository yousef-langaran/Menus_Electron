/**
 * ثبت مرکزی میانبرهای کیبورد اپ. هم برای رندر کردن راهنما (ShortcutsHelpModal) استفاده می‌شود
 * و هم برای نمایش برچسب کلید کنار آیتم‌های منو (ElectronMenubar) — تا این دو همیشه هم‌خوان بمانند.
 */

export interface NavShortcut {
  keys: string;
  path: string;
  label: string;
}

export interface OperationShortcut {
  keys: string;
  label: string;
  scope: string;
}

/** میانبرهای ناوبری بین صفحات — با GlobalShortcutListener در App.tsx هماهنگ نگه دار */
export const NAV_SHORTCUTS: NavShortcut[] = [
  { keys: 'F2', path: '/order', label: 'ثبت سفارش' },
  { keys: 'F3', path: '/orders', label: 'لیست سفارشات' },
  { keys: 'F4', path: '/products', label: 'مدیریت محصولات' },
  { keys: 'F6', path: '/categories', label: 'مدیریت دسته‌بندی‌ها' },
  { keys: 'F7', path: '/kds', label: 'نمایشگر آشپزخانه' },
  { keys: 'F8', path: '/order-returns', label: 'مرجوعی‌ها' },
  { keys: 'F9', path: '/settings', label: 'تنظیمات و سخت‌افزار' },
];

export function shortcutForPath(path: string): string | undefined {
  return NAV_SHORTCUTS.find((s) => s.path === path)?.keys;
}

/** میانبرهای عملیاتی — فقط برای نمایش در راهنما؛ هرکدام جایی در کد پیاده‌سازی شده‌اند */
export const OPERATION_SHORTCUTS: OperationShortcut[] = [
  { keys: 'F1', label: 'نمایش/بستن راهنمای میانبرها', scope: 'سراسری' },
  { keys: 'اسکن بارکد', label: 'افزودن خودکار محصول به سبد', scope: 'صفحه ثبت سفارش — بیرون از فیلدهای متنی و مودال‌ها' },
  { keys: 'Enter', label: 'باز کردن مودال نهایی‌سازی/پرداخت (وقتی سبد خالی نیست)', scope: 'صفحه ثبت سفارش — بیرون از فیلدهای متنی' },
  { keys: 'Enter', label: 'ثبت نهایی سفارش', scope: 'داخل مودال پرداخت — روی فیلد شماره موبایل یا کد تخفیف' },
  { keys: 'Esc', label: 'پاک کردن عبارت جستجوی محصول', scope: 'صفحه ثبت سفارش' },
  { keys: 'Ctrl + Shift + Backspace', label: 'بازنشانی سفارش جاری (شروع سفارش تازه)', scope: 'صفحه ثبت سفارش' },
  { keys: '← / →', label: 'رفتن به سفارش بعدی/قبلی', scope: 'صفحه لیست سفارشات — بیرون از فیلدهای متنی' },
];
