import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { getPrintTemplates } from '../services/api';
import { getPrimaryRestaurantId } from '../lib/electronPermissions';

/**
 * کامپوننت پس‌زمینه: قالب‌های چاپ ذخیره‌شدهٔ محلی (به‌ازای هر پرینتر + پیش‌فرض برنامه)
 * را با آخرین محتوای همان قالب (بر اساس id) از سرور به‌روز نگه می‌دارد.
 *
 * چرا لازم است: انتخاب یک قالب برای یک پرینتر، محتوای آن لحظه را به‌صورت یک
 * اسنپ‌شات کامل در preferences محلی کپی می‌کند (نه یک ارجاع زنده). اگر ادمین بعداً
 * محتوای همان قالب را در پنل وب عوض کند (مثلاً عکس لوگو را از مالتی‌مدیا انتخاب کند)،
 * بدون این سینک، پنل الکترون تا وقتی کسی دوباره از دراپ‌داون تنظیمات همان قالب را
 * صراحتاً انتخاب نکند، هیچ‌وقت نسخهٔ تازه را نمی‌بیند — و چاپ همچنان از روی نسخهٔ
 * قدیمی/بدون‌عکس انجام می‌شود، بی‌آنکه خطایی دیده شود.
 *
 * هیچ UI نمایش نمی‌دهد. فعال‌سازی: mount، آنلاین‌شدن، focus، هر ۵ دقیقه.
 */
export function PrintTemplateSyncManager() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const restaurantId = getPrimaryRestaurantId(user);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!token || !restaurantId || !window.electronAPI?.refreshCachedPrintTemplates) return;

    const sync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const list = await getPrintTemplates(restaurantId, token);
        if (Array.isArray(list) && list.length > 0) {
          await window.electronAPI!.refreshCachedPrintTemplates!(list);
        }
      } catch (e) {
        console.warn('[PrintTemplateSync] refresh failed:', e);
      } finally {
        syncingRef.current = false;
      }
    };

    void sync();

    const onOnline = () => void sync();
    const onFocus = () => void sync();
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void sync(), 5 * 60_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [token, restaurantId]);

  return null;
}
