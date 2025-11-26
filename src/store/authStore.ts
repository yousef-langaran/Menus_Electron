import { create } from 'zustand';
import { cacheUser, getCachedUser, clearUserCache } from '../services/cache';
import { login as apiLogin, fetchProfile } from '../services/api';

interface User {
  id: number;
  mobile: string;
  firstName?: string;
  lastName?: string;
  restaurants?: any[];
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
      console.log('[AuthStore] Cached user ready', {
        restaurants: resolvedUser?.restaurants?.length,
      });
      set({ user: resolvedUser, token: cached.token, isHydrated: true });
      return;
    }
    set({ isHydrated: true });
  },
}));

