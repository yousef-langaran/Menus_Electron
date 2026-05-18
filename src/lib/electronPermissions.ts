/**
 * دسترسی‌های پنل دسکتاپ بر اساس restaurantPermissions بک‌اند
 * (هم‌راستا با RestaurantPermissionModule در Menus_BE)
 */

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

export function isOwnerOrAdmin(user: ElectronUser): boolean {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((r) =>
    ['restaurant_owner', 'admin', 'super_admin'].includes(String(r?.title)),
  );
}

/** حداقل یکی از anyOfActions؛ manage همیشه همه را پوشش می‌دهد */
export function hasModuleAccess(
  user: ElectronUser,
  module: string,
  anyOfActions: string[],
  restaurantId?: number,
): boolean {
  if (!user) return false;
  if (isOwnerOrAdmin(user)) return true;
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

/** همان شرط ورود به اپ (ثبت سفارش) */
export function hasOrderRegisterAccess(user: ElectronUser): boolean {
  const rid = getPrimaryRestaurantId(user);
  return hasModuleAccess(user, 'orders_management', ['create', 'manage'], rid);
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
      hasOrderRegisterAccess(user) ||
      hasModuleAccess(user, 'orders_list', ['read', 'manage'], rid) ||
      hasModuleAccess(user, 'orders_management', ['read', 'manage'], rid)
    );
  }

  if (p === '/products') {
    return hasModuleAccess(user, 'products', ['read', 'create', 'update', 'manage'], rid);
  }

  if (p === '/categories') {
    return hasModuleAccess(user, 'categories', ['read', 'create', 'update', 'manage'], rid);
  }

  if (p === '/settings') {
    return (
      hasModuleAccess(user, 'electron_panel', ['read', 'manage'], rid) ||
      hasModuleAccess(user, 'print_templates', ['read', 'manage'], rid)
    );
  }

  if (p === '/card-terminals') {
    return (
      hasModuleAccess(user, 'electron_panel', ['read', 'manage'], rid) ||
      isOwnerOrAdmin(user)
    );
  }

  if (p === '/accounting' || p.startsWith('/accounting/')) {
    return (
      hasModuleAccess(user, 'accounting', ['read', 'manage'], rid) ||
      hasModuleAccess(user, 'purchases', ['read', 'manage'], rid) ||
      hasModuleAccess(user, 'inventory', ['read', 'manage'], rid)
    );
  }

  return false;
}
