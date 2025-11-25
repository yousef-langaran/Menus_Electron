// These functions will be implemented using IndexedDB via Dexie
// For now, we'll use a simple in-memory cache with localStorage fallback

let menuCache: any = null;
let userCache: any = null;

const hasElectronBridge = () => typeof window !== 'undefined' && Boolean(window.electronAPI);

export async function cacheMenu(restaurantId: number, restaurantName: string, products: any[], categories: any[]) {
  menuCache = {
    restaurantId,
    restaurantName,
    products,
    categories,
    cachedAt: new Date().toISOString(),
  };
  
  try {
    localStorage.setItem('menuCache', JSON.stringify(menuCache));
  } catch (error) {
    console.error('Failed to cache menu:', error);
  }
}

export async function getCachedMenu(restaurantId?: number, restaurantName?: string) {
  if (menuCache) {
    return menuCache;
  }

  try {
    const cached = localStorage.getItem('menuCache');
    if (cached) {
      menuCache = JSON.parse(cached);
      return menuCache;
    }
  } catch (error) {
    console.error('Failed to get cached menu:', error);
  }

  return null;
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

