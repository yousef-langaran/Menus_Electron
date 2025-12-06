import { create } from 'zustand';
import { cacheUser, getCachedUser, clearUserCache } from '../services/cache';
import { login as apiLogin, fetchProfile, getActiveSubscription } from '../services/api';

interface User {
  id: number;
  mobile: string;
  firstName?: string;
  lastName?: string;
  restaurants?: any[];
  restaurantPermissions?: Array<{
    id: number;
    module: string;
    actions: string[];
    isActive: boolean;
    restaurant?: {
      id: number;
      name: string;
      name_fa: string;
    };
  }>;
}

interface Subscription {
  id: number;
  status: string;
  expiresAt: string;
  startsAt: string;
  plan?: {
    id: number;
    name: string;
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadCachedUser: () => Promise<void>;
}

const needsProfileRefresh = (user?: User | null) =>
  !user?.restaurants || user.restaurants.length === 0;

const hydrateUserProfile = async (token: string, fallbackUser: User): Promise<User> => {
  if (!token) {
    console.warn('[AuthStore] No token provided for profile hydration.');
    return fallbackUser;
  }
  try {
    console.log('[AuthStore] Fetching profile for hydration...');
    const profile = await fetchProfile(token);
    if (profile) {
      console.log('[AuthStore] Profile fetched', {
        restaurants: profile?.restaurants?.length,
        ownedRestaurants: profile?.ownedRestaurants?.length,
      });
      return profile;
    }
  } catch (error) {
    console.warn('Failed to fetch user profile, falling back to cached user.', error);
  }
  return fallbackUser;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isHydrated: false,
  error: null,

  login: async (mobile: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      console.log('[AuthStore] Logging in user...');
      const response = await apiLogin(mobile, password);

      let rawUser: User | null = null;
      let token: string | null = null;

      if (response.user && response.access_token) {
        rawUser = response.user;
        token = response.access_token;
      } else if (response.data && response.data.user && response.data.access_token) {
        rawUser = response.data.user;
        token = response.data.access_token;
      } else {
        throw new Error('پاسخ نامعتبر از سرور');
      }

      if (!rawUser || !token) {
        throw new Error('اطلاعات کاربر یا توکن ناقص است');
      }

      console.log('[AuthStore] Login succeeded, evaluating profile hydration', {
        hasRestaurants: !!rawUser.restaurants,
        restaurantCount: rawUser.restaurants?.length,
      });

      const hydratedUser = needsProfileRefresh(rawUser)
        ? await hydrateUserProfile(token, rawUser)
        : rawUser;

      console.log('[AuthStore] User hydrated', {
        restaurants: hydratedUser?.restaurants?.length,
      });

      // بررسی دسترسی ثبت سفارش
      const hasOrderPermission = checkOrderPermission(hydratedUser);
      if (!hasOrderPermission) {
        throw new Error('شما دسترسی ثبت سفارش ندارید. لطفاً با مدیر سیستم تماس بگیرید.');
      }

      // بررسی اشتراک فعال
      const subscriptionValid = await checkSubscription(hydratedUser, token);
      if (!subscriptionValid.valid) {
        throw new Error(subscriptionValid.message || 'اشتراک شما منقضی شده است. لطفاً اشتراک خود را تمدید کنید.');
      }

      await cacheUser(hydratedUser, token);
      set({
        user: hydratedUser,
        token,
        isLoading: false,
        isHydrated: true,
      });
    } catch (error: any) {
      let errorMessage = 'خطا در ورود به سیستم';
      
      if (error.response) {
        // Server responded with error
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      `خطا: ${error.response.status} ${error.response.statusText}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'خطا در اتصال به سرور. لطفاً اتصال اینترنت خود را بررسی کنید.';
      } else {
        // Something else happened
        errorMessage = error.message || 'خطا در ورود به سیستم';
      }
      
      console.error('Login error:', error);
      set({
        error: errorMessage,
        isLoading: false,
        isHydrated: true,
      });
      throw new Error(errorMessage);
    }
  },

  logout: async () => {
    await clearUserCache();
    set({ user: null, token: null, isHydrated: true });
  },

  loadCachedUser: async () => {
    const cached = await getCachedUser();
    if (cached && cached.user && cached.token) {
      console.log('[AuthStore] Cached user found, checking profile hydration', {
        hasRestaurants: !!cached.user.restaurants,
        restaurantCount: cached.user.restaurants?.length,
      });
      let resolvedUser = cached.user;
      if (needsProfileRefresh(resolvedUser)) {
        resolvedUser = await hydrateUserProfile(cached.token, resolvedUser);
        await cacheUser(resolvedUser, cached.token);
      }
      
      // بررسی دسترسی ثبت سفارش
      const hasOrderPermission = checkOrderPermission(resolvedUser);
      if (!hasOrderPermission) {
        console.warn('[AuthStore] Cached user does not have order permission');
        set({ isHydrated: true });
        return;
      }

      // بررسی اشتراک (حتی در حالت آفلاین)
      const subscriptionValid = await checkSubscription(resolvedUser, cached.token);
      if (!subscriptionValid.valid) {
        console.warn('[AuthStore] Cached user subscription is invalid:', subscriptionValid.message);
        set({ isHydrated: true });
        return;
      }

      console.log('[AuthStore] Cached user ready', {
        restaurants: resolvedUser?.restaurants?.length,
      });
      set({ user: resolvedUser, token: cached.token, isHydrated: true });
      return;
    }
    set({ isHydrated: true });
  },
}));

// بررسی دسترسی ثبت سفارش
function checkOrderPermission(user: User | null): boolean {
  if (!user) return false;

  // بررسی دسترسی ORDERS_MANAGEMENT با action CREATE
  const permissions = user.restaurantPermissions || [];
  const primaryRestaurant = user.restaurants?.[0];
  
  if (!primaryRestaurant) return false;

  const hasPermission = permissions.some(perm => {
    if (!perm.isActive) return false;
    if (perm.restaurant?.id !== primaryRestaurant.id) return false;
    if (perm.module !== 'orders_management') return false;
    return perm.actions?.includes('create') || perm.actions?.includes('manage');
  });

  console.log('[AuthStore] Order permission check:', {
    hasPermission,
    restaurantId: primaryRestaurant.id,
    permissions: permissions.map(p => ({ module: p.module, actions: p.actions, restaurant: p.restaurant?.id })),
  });

  return hasPermission;
}

// بررسی اشتراک فعال
async function checkSubscription(user: User | null, token: string): Promise<{ valid: boolean; message?: string }> {
  if (!user) return { valid: false, message: 'کاربر یافت نشد' };

  const primaryRestaurant = user.restaurants?.[0];
  if (!primaryRestaurant) {
    return { valid: false, message: 'رستوران یافت نشد' };
  }

  const restaurantId = primaryRestaurant.id;
  const storageKey = `subscription_check_${restaurantId}`;
  const storageDataKey = `subscription_data_${restaurantId}`;

  // بررسی آنلاین بودن
  const isOnline = window.electronAPI 
    ? await window.electronAPI.checkOnline() 
    : navigator.onLine;

  if (isOnline) {
    try {
      // تلاش برای دریافت اشتراک از سرور
      const subscription: Subscription = await getActiveSubscription(restaurantId, token);
      
      if (!subscription) {
        // پاک کردن اطلاعات کش شده
        localStorage.removeItem(storageKey);
        localStorage.removeItem(storageDataKey);
        return { valid: false, message: 'اشتراک فعالی یافت نشد' };
      }

      const now = new Date();
      const expiresAt = new Date(subscription.expiresAt);
      
      if (expiresAt < now || subscription.status !== 'active') {
        // پاک کردن اطلاعات کش شده
        localStorage.removeItem(storageKey);
        localStorage.removeItem(storageDataKey);
        return { valid: false, message: 'اشتراک شما منقضی شده است' };
      }

      // ذخیره اطلاعات اشتراک و زمان بررسی
      localStorage.setItem(storageKey, now.toISOString());
      localStorage.setItem(storageDataKey, JSON.stringify({
        expiresAt: subscription.expiresAt,
        status: subscription.status,
      }));

      return { valid: true };
    } catch (error: any) {
      console.warn('[AuthStore] Failed to check subscription online:', error);
      // اگر خطا در دریافت اشتراک بود، از کش استفاده می‌کنیم
    }
  }

  // در حالت آفلاین، از اطلاعات کش شده استفاده می‌کنیم
  const lastCheckStr = localStorage.getItem(storageKey);
  const subscriptionDataStr = localStorage.getItem(storageDataKey);
  
  if (lastCheckStr && subscriptionDataStr) {
    try {
      const lastCheck = new Date(lastCheckStr);
      const subscriptionData = JSON.parse(subscriptionDataStr);
      const now = new Date();
      const expiresAt = new Date(subscriptionData.expiresAt);
      
      // بررسی انقضای اشتراک
      if (expiresAt < now || subscriptionData.status !== 'active') {
        // پاک کردن اطلاعات منقضی شده
        localStorage.removeItem(storageKey);
        localStorage.removeItem(storageDataKey);
        return { valid: false, message: 'اشتراک شما منقضی شده است' };
      }

      // بررسی اینکه آیا کمتر از 24 ساعت از آخرین بررسی گذشته باشد
      const hoursSinceCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCheck < 24) {
        return { valid: true };
      } else {
        // اگر بیشتر از 24 ساعت گذشته، باید دوباره بررسی شود
        return { valid: false, message: 'برای بررسی اعتبار اشتراک، اتصال اینترنت لازم است' };
      }
    } catch (error) {
      console.error('[AuthStore] Error parsing cached subscription data:', error);
      localStorage.removeItem(storageKey);
      localStorage.removeItem(storageDataKey);
    }
  }

  // اگر آنلاین نیستیم و اطلاعات کش شده نداریم، اجازه نمی‌دهیم
  return { valid: false, message: 'برای بررسی اعتبار اشتراک، اتصال اینترنت لازم است' };
}

