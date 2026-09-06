/**
 * دسترسی‌های پنل دسکتاپ بر اساس restaurantPermissions بک‌اند
 * (هم‌راستا با RestaurantPermissionModule در Menus_BE)
 */
import { MODULES, ACTIONS } from '../types';

export { MODULES, ACTIONS };

export type RestaurantPermissionRow = {
  id?: number;
  module: string;
  actions: string[];
  isActive: boolean;
  restaurant?: { id: number };
};

export type ElectronUser = {
  roles?: Array<{ title?: string }>;
  restaurants?: Array<{ id: number }>;
  restaurantPermissions?: RestaurantPermissionRow[];
} | null;

export function getPrimaryRestaurantId(user: ElectronUser): number | undefined {
  return user?.restaurants?.[0]?.id;
}

/** آیا کاربر صرف‌نظر از نقش، صاحب یکی از رستوران‌هاست؟ (فقط برای نمایش برچسب/منطق صاحب) */
export function isRestaurantOwner(user: ElectronUser): boolean {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((r) => String(r?.title) === 'restaurant_owner');
}

/** ادمین سیستمی (پشتیبانی/توسعه) که به همه ماژول‌ها دسترسی کامل دارد. */
export function isSystemAdmin(user: ElectronUser): boolean {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((r) => ['admin', 'super_admin'].includes(String(r?.title)));
}

/**
 * @deprecated از `isSystemAdmin` برای دسترسی کامل و `isRestaurantOwner` برای شناسایی
 * صاحب رستوران استفاده کنید. صاحب رستوران دیگر نباید همه دسترسی‌ها را دور بزند؛
 * دسترسی او باید از طریق restaurantPermissions کنترل شود.
 *
 * برای حفظ سازگاری با کدهای فعلی که این تابع را می‌خوانند، فقط ادمین سیستمی را
 * پوشش می‌دهد (نه restaurant_owner).
 */
export function isOwnerOrAdmin(user: ElectronUser): boolean {
  return isSystemAdmin(user);
}

/** حداقل یکی از anyOfActions؛ manage همیشه همه را پوشش می‌دهد */
export function hasModuleAccess(
  user: ElectronUser,
  module: string,
  anyOfActions: string[],
  restaurantId?: number,
): boolean {
  if (!user) return false;
  // فقط ادمین سیستمی دسترسی کامل دارد؛ صاحب رستوران از طریق restaurantPermissions کنترل می‌شود.
  if (isSystemAdmin(user)) return true;
  const rid = restaurantId ?? getPrimaryRestaurantId(user);
  const perms = user.restaurantPermissions || [];
  return perms.some((perm) => {
    if (!perm.isActive) return false;
    if (perm.module !== module) return false;
    if (rid != null && perm.restaurant?.id != null && perm.restaurant.id !== rid) return false;
    const acts = perm.actions || [];
    if (acts.includes('manage')) return true;
    return anyOfActions.some((a) => acts.includes(a));
  });
}

/** ترازو و کالر ای دی در تنظیمات — فقط owner/admin یا دارنده electron_panel:manage */
export function canManageHardwareSettings(user: ElectronUser): boolean {
  const rid = getPrimaryRestaurantId(user);
  return (
    isOwnerOrAdmin(user) ||
    hasModuleAccess(user, MODULES.ELECTRON_PANEL, [ACTIONS.MANAGE], rid)
  );
}

/** همان شرط ورود به اپ (ثبت سفارش) */
export function hasOrderRegisterAccess(user: ElectronUser): boolean {
  const rid = getPrimaryRestaurantId(user);
  return hasModuleAccess(user, MODULES.ORDERS_MANAGEMENT, [ACTIONS.CREATE, ACTIONS.MANAGE], rid);
}

export function canAccessRoute(user: ElectronUser, pathname: string): boolean {
  if (!user) return false;
  const p = pathname.replace(/\/+$/, '') || '/';
  const rid = getPrimaryRestaurantId(user);

  if (p === '/order') {
    return hasOrderRegisterAccess(user);
  }

  if (p === '/orders') {
    return (
      hasModuleAccess(user, MODULES.ORDERS_LIST, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ORDERS_MANAGEMENT, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/order-returns') {
    return (
      hasModuleAccess(user, MODULES.ORDERS_LIST, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ORDERS_MANAGEMENT, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/kds') {
    return (
      hasModuleAccess(user, MODULES.ORDERS_LIST, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ORDERS_MANAGEMENT, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  // فراخوان گارسون: مجوز اختصاصی، یا همان مجوز مدیریت سفارش که گارسون‌ها
  // معمولاً از قبل دارند (هم‌راستا با گیت بک‌اند روی `/waiter-calls`).
  // شیفت صندوق: از همان مجوز ELECTRON_PANEL که سایر ابزارهای سخت‌افزاری/عملیاتی
  // صندوق‌دار (تنظیمات، کارتخوان) هم‌راستا با گیت بک‌اند روی pos-shifts استفاده می‌کند.
  if (p === '/pos-shift') {
    return hasModuleAccess(
      user,
      MODULES.ELECTRON_PANEL,
      [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.MANAGE],
      rid,
    );
  }

  if (p === '/waiter-calls') {
    return (
      hasModuleAccess(user, MODULES.WAITER_CALLS, [ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ORDERS_MANAGEMENT, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ORDERS_LIST, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/products') {
    return hasModuleAccess(user, MODULES.PRODUCTS, [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.MANAGE], rid);
  }

  if (p === '/categories') {
    return hasModuleAccess(user, MODULES.CATEGORIES, [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.MANAGE], rid);
  }

  if (p === '/settings') {
    return (
      hasModuleAccess(user, MODULES.ELECTRON_PANEL, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.PRINT_TEMPLATES, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/card-terminals') {
    return hasModuleAccess(user, MODULES.ELECTRON_PANEL, [ACTIONS.READ, ACTIONS.MANAGE], rid);
  }

  if (p === '/accounting') {
    return (
      hasModuleAccess(user, MODULES.ACCOUNTING, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.PURCHASES, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.INVENTORY, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/accounting/raw-materials' || p === '/accounting/raw-material-categories' || p === '/accounting/kardex') {
    return (
      hasModuleAccess(user, MODULES.INVENTORY, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ACCOUNTING, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/accounting/suppliers' || p === '/accounting/purchase-drafts' || p === '/accounting/purchase-returns') {
    return (
      hasModuleAccess(user, MODULES.PURCHASES, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasModuleAccess(user, MODULES.ACCOUNTING, [ACTIONS.READ, ACTIONS.MANAGE], rid)
    );
  }

  if (p === '/accounting/expenses' || p === '/accounting/cash-accounts' || p === '/accounting/expense-categories') {
    return hasModuleAccess(user, MODULES.ACCOUNTING, [ACTIONS.READ, ACTIONS.MANAGE], rid);
  }

  if (p === '/call-history') {
    return (
      hasModuleAccess(user, MODULES.ELECTRON_PANEL, [ACTIONS.READ, ACTIONS.MANAGE], rid) ||
      hasOrderRegisterAccess(user)
    );
  }

  if (p === '/service-jobs') {
    return hasModuleAccess(user, MODULES.SERVICE_JOBS, [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.MANAGE], rid);
  }

  return false;
}
