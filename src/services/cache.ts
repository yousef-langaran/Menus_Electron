// These functions will be implemented using IndexedDB via Dexie
// For now, we'll use a simple in-memory cache with localStorage fallback

let menuCache: any = null;
let userCache: any = null;

const hasElectronBridge = () => typeof window !== 'undefined' && Boolean(window.electronAPI);

export async function cacheMenu(
  restaurantId: number,
  restaurantName: string,
  products: any[],
  categories: any[],
  cartItemOptions?: string[],
  isMobileRequiredInElectronPanel?: boolean,
  isScaleIntegrationEnabled?: boolean,
  restrictScaleAccessToElectronManagers?: boolean,
  isCardTerminalEnabled?: boolean,
  restrictCardTerminalAccessToElectronManagers?: boolean,
  allowDirectSendAmountToCardTerminal?: boolean,
  lastUpdatedAt?: string | null,
  productCategories?: any[],
  /** نرخ ارزش افزوده (درصد) — null یعنی رستوران نرخی تنظیم نکرده */
  vatRate?: number | null,
) {
  menuCache = {
    restaurantId,
    restaurantName,
    products,
    categories,
    productCategories: productCategories || [],
    cartItemOptions: cartItemOptions || [],
    isMobileRequiredInElectronPanel: isMobileRequiredInElectronPanel || false,
    isScaleIntegrationEnabled: isScaleIntegrationEnabled || false,
    restrictScaleAccessToElectronManagers: restrictScaleAccessToElectronManagers !== false,
    isCardTerminalEnabled: isCardTerminalEnabled || false,
    restrictCardTerminalAccessToElectronManagers: restrictCardTerminalAccessToElectronManagers !== false,
    allowDirectSendAmountToCardTerminal: allowDirectSendAmountToCardTerminal || false,
    lastUpdatedAt: lastUpdatedAt ?? null,
    vatRate: vatRate ?? null,
    cachedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem('menuCache', JSON.stringify(menuCache));
  } catch (error) {
    console.error('Failed to cache menu:', error);
  }
}

// A cached menu is only usable if it actually belongs to the restaurant being
// requested — otherwise switching accounts/restaurants on the same machine would
// briefly show a *different* restaurant's stale products (and photos) before the
// real fetch for the current restaurant overwrites it.
const matchesRestaurant = (cached: any, restaurantId?: number, restaurantName?: string) => {
  if (!cached) return false;
  if (restaurantId != null) return Number(cached.restaurantId) === Number(restaurantId);
  if (restaurantName) return cached.restaurantName === restaurantName;
  return true;
};

export async function getCachedMenu(restaurantId?: number, restaurantName?: string) {
  if (menuCache) {
    return matchesRestaurant(menuCache, restaurantId, restaurantName) ? menuCache : null;
  }

  try {
    const cached = localStorage.getItem('menuCache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (!matchesRestaurant(parsed, restaurantId, restaurantName)) return null;
      menuCache = parsed;
      return menuCache;
    }
  } catch (error) {
    console.error('Failed to get cached menu:', error);
  }

  return null;
}

/**
 * کش میزهای رستوران. صندوق باید در حالت آفلاین هم بتواند میز انتخاب کند،
 * پس آخرین فهرست میزها به تفکیک رستوران نگه داشته می‌شود. وضعیت میز
 * (اشغال/آزاد) در آفلاین قدیمی است و فقط نام/بخش میز قابل اتکاست.
 */
export async function cacheTables(restaurantId: number, tables: any[]) {
  try {
    localStorage.setItem(
      'tablesCache',
      JSON.stringify({ restaurantId, tables, cachedAt: new Date().toISOString() }),
    );
  } catch (error) {
    console.error('Failed to cache tables:', error);
  }
}

export async function getCachedTables(restaurantId?: number): Promise<any[]> {
  try {
    const cached = localStorage.getItem('tablesCache');
    if (!cached) return [];
    const parsed = JSON.parse(cached);
    if (restaurantId != null && Number(parsed?.restaurantId) !== Number(restaurantId)) return [];
    return Array.isArray(parsed?.tables) ? parsed.tables : [];
  } catch (error) {
    console.error('Failed to get cached tables:', error);
    return [];
  }
}

export async function cacheUser(user: any, token: string) {
  userCache = {
    user,
    token,
    cachedAt: new Date().toISOString(),
  };

  let persisted = false;

  if (hasElectronBridge() && window.electronAPI?.saveUserSession) {
    try {
      const result = await window.electronAPI.saveUserSession({ user, token });
      if (result?.success) {
        persisted = true;
      }
    } catch (error) {
      console.error('Failed to save user session via electron bridge:', error);
    }
  }

  if (!persisted) {
    try {
      localStorage.setItem('userCache', JSON.stringify(userCache));
    } catch (error) {
      console.error('Failed to cache user:', error);
    }
  }
}

export async function getCachedUser() {
  if (userCache) {
    return userCache;
  }

  if (hasElectronBridge() && window.electronAPI?.loadUserSession) {
    try {
      const cached = await window.electronAPI.loadUserSession();
      if (cached?.user && cached?.token) {
        userCache = cached;
        return cached;
      }
    } catch (error) {
      console.error('Failed to load user session via electron bridge:', error);
    }
  }

  try {
    const cached = localStorage.getItem('userCache');
    if (cached) {
      userCache = JSON.parse(cached);
      return userCache;
    }
  } catch (error) {
    console.error('Failed to get cached user:', error);
  }

  return null;
}

export async function clearUserCache() {
  userCache = null;

  if (hasElectronBridge() && window.electronAPI?.clearUserSession) {
    try {
      const result = await window.electronAPI.clearUserSession();
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to clear user session');
      }
    } catch (error) {
      console.error('Failed to clear user session via electron bridge:', error);
    }
  }

  try {
    localStorage.removeItem('userCache');
  } catch (error) {
    console.error('Failed to clear user cache:', error);
  }
}

